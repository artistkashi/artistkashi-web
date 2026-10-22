from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import razorpay
from fastcrud import JoinConfig, compute_offset
from fastcrud.types import GetMultiResponseModel
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import (
    ConflictException,
    ErrorCode,
    NotFoundException,
    ServiceException,
    ValidationException,
)
from app.crud.coupon import crud_coupon
from app.crud.course import crud_course, crud_course_enrollment, crud_course_payment
from app.crud.user import crud_user as crud_user_payment
from app.models.course import Course
from app.models.course_enrollment import CourseEnrollment
from app.models.course_payment import CoursePayment, CoursePaymentStatus
from app.models.user import User
from app.schemas.course import CourseRead
from app.schemas.course_enrollment import CourseEnrollmentRead
from app.schemas.course_payment import (
    AdminCoursePaymentRead,
    AdminEnrolledStudentRead,
    CoursePaymentCreate,
    CoursePaymentRead,
    CoursePaymentVerificationRequest,
    CoursePurchaseRequest,
    CoursePurchaseResponse,
)
from app.schemas.user import UserRead
from app.services.coupon_service import coupon_service
from app.services.email.email import send_course_purchase_email
from app.services.enrollment_service import enrollment_service
from app.services.progress_service import progress_service


class CoursePaymentService:
    def __init__(self):
        self.razorpay_client = razorpay.Client(
            auth=(settings.RAZORPAY_KEY_ID or "", settings.RAZORPAY_KEY_SECRET or "")
        )

    async def initiate_purchase(
        self,
        *,
        session: AsyncSession,
        user_id: uuid.UUID,
        slug: str,
        payload: CoursePurchaseRequest,
    ) -> CoursePurchaseResponse:
        course = await crud_course.get(
            db=session,
            slug=slug,
            is_deleted=False,
            is_published=True,
            schema_to_select=CourseRead,
            return_as_model=True,
        )
        if not course:
            raise NotFoundException(
                resource="Course",
                identifier=slug,
                error_code=ErrorCode.COURSE_NOT_FOUND,
            )

        already_enrolled = await crud_course_enrollment.exists(
            db=session, user_id=user_id, course_id=course.id
        )
        if already_enrolled:
            raise ConflictException(
                message="User is already enrolled in this course",
                error_code=ErrorCode.ENROLLMENT_ALREADY_EXISTS,
            )

        if course.price <= 0:
            raise ValidationException(
                message="Course is free. Use the enrollment endpoint instead."
            )

        existing_pending = await crud_course_payment.get(
            db=session,
            user_id=user_id,
            course_id=course.id,
            status=CoursePaymentStatus.PENDING,
        )
        if existing_pending:
            raise ConflictException(
                message="A pending payment already exists for this course",
                error_code=ErrorCode.COURSE_PAYMENT_ALREADY_PAID,
            )

        # Validate coupon if provided
        coupon_code = payload.coupon_code
        discount_amount = Decimal("0")
        gateway_fee = Decimal("0")
        final_amount = course.price
        coupon = None

        if coupon_code:
            # Validate coupon for this course
            coupon_items = [
                {
                    "type": "course",
                    "id": course.id,
                    "quantity": 1,
                    "unit_price": course.price,
                }
            ]

            coupon_result = await coupon_service.validate_coupon_for_items(
                session=session,
                coupon_code=coupon_code,
                user_id=user_id,
                cart_items=coupon_items,
            )

            if not coupon_result["valid"]:
                raise ValidationException(message="Invalid coupon code")

            coupon = await coupon_service.get_coupon_by_code(session, coupon_code)
            coupon_code = coupon_code
            discount_amount = coupon_result["discount_amount"]
            gateway_fee = coupon_result["gateway_fee"]
            final_amount = coupon_result["final_total"]
        else:
            # No coupon - calculate normally
            discount_amount = Decimal("0")
            gateway_fee = coupon_service.calculate_gateway_fee(course.price)
            final_amount = (course.price - Decimal("0") + gateway_fee).quantize(
                Decimal("0.01")
            )

        try:
            payment = await crud_course_payment.create(
                db=session,
                object=CoursePaymentCreate(
                    user_id=user_id,
                    course_id=course.id,
                    amount=final_amount,
                    subtotal=course.price,
                    discount_amount=discount_amount,
                    gateway_fee=gateway_fee,
                    coupon_id=coupon.id if coupon else None,
                    coupon_code=coupon_code,
                    razorpay_order_id="pending",
                    status=CoursePaymentStatus.PENDING,
                ),
                schema_to_select=CoursePaymentRead,
                return_as_model=True,
                commit=False,
            )

            razorpay_order = self.razorpay_client.order.create(
                data={
                    "amount": int(final_amount * 100),
                    "currency": "INR",
                    "receipt": str(payment.id),
                }
            )

            await crud_course_payment.update(
                db=session,
                id=payment.id,
                object={
                    "razorpay_order_id": razorpay_order["id"],
                },
                commit=False,
            )

            await session.commit()

            return CoursePurchaseResponse(
                razorpay_order_id=razorpay_order["id"],
                amount=final_amount,
                course_id=course.id,
                course_title=course.title,
            )

        except Exception as exc:
            await session.rollback()
            raise ServiceException(
                "Course Payment",
                f"Failed to initiate purchase: {exc}",
            ) from exc

    async def verify_payment(
        self,
        *,
        session: AsyncSession,
        user_id: uuid.UUID,
        slug: str,
        payload: CoursePaymentVerificationRequest,
    ) -> CourseEnrollmentRead:
        course = await crud_course.get(
            db=session,
            slug=slug,
            is_deleted=False,
            schema_to_select=CourseRead,
            return_as_model=True,
        )
        if not course:
            raise NotFoundException(
                resource="Course",
                identifier=slug,
                error_code=ErrorCode.COURSE_NOT_FOUND,
            )

        payment_result = await session.execute(
            select(CoursePayment)
            .where(
                CoursePayment.razorpay_order_id == payload.razorpay_order_id,
                CoursePayment.user_id == user_id,
                CoursePayment.course_id == course.id,
            )
            .with_for_update()
        )
        payment = payment_result.scalar_one_or_none()
        if not payment:
            raise NotFoundException(
                resource="Course Payment",
                identifier=payload.razorpay_order_id,
                error_code=ErrorCode.COURSE_PAYMENT_NOT_FOUND,
            )

        if payment.status == CoursePaymentStatus.PAID:
            enrollment = await enrollment_service.get_user_course_enrollment(
                session=session, user_id=user_id, course_id=course.id
            )
            if enrollment:
                return enrollment
            raise ConflictException(
                message="Payment is paid but enrollment is missing; contact support",
                error_code=ErrorCode.COURSE_PAYMENT_ALREADY_PAID,
            )

        params_dict = {
            "razorpay_order_id": payload.razorpay_order_id,
            "razorpay_payment_id": payload.razorpay_payment_id,
            "razorpay_signature": payload.razorpay_signature,
        }

        try:
            self.razorpay_client.utility.verify_payment_signature(params_dict)
        except Exception as exc:
            await crud_course_payment.update(
                db=session,
                id=payment.id,
                object={"status": CoursePaymentStatus.FAILED},
            )
            raise ValidationException("Invalid payment signature") from exc

        try:
            # Consume coupon if one was used
            if payment.coupon_id and payment.discount_amount > 0:
                await coupon_service.consume_coupon(
                    session=session,
                    coupon=await crud_coupon.get(session, id=payment.coupon_id),
                    user_id=user_id,
                    order_id=None,
                    course_payment_id=payment.id,
                    discount_amount=payment.discount_amount,
                )

            await crud_course_payment.update(
                db=session,
                id=payment.id,
                object={
                    "status": CoursePaymentStatus.PAID,
                    "razorpay_payment_id": payload.razorpay_payment_id,
                    "razorpay_signature": payload.razorpay_signature,
                    "paid_at": datetime.now(UTC),
                },
                commit=False,
            )

            enrollment = await enrollment_service.enroll(
                session=session, user_id=user_id, course_id=course.id
            )
            await session.commit()

            try:
                user = await crud_user_payment.get(
                    db=session,
                    id=user_id,
                    schema_to_select=UserRead,
                    return_as_model=True,
                )
                if user:
                    await send_course_purchase_email(
                        user=user,
                        course_title=course.title,
                        course_slug=slug,
                    )
            except Exception:
                pass

            return enrollment

        except Exception as exc:
            await session.rollback()
            raise ServiceException(
                "Course Payment",
                f"Failed to verify payment: {exc}",
            ) from exc

    async def admin_direct_enroll(
        self,
        *,
        session: AsyncSession,
        course_id: uuid.UUID,
        user_id: uuid.UUID,
        amount_paid: Decimal,
        note: str | None = None,
    ) -> CourseEnrollmentRead:
        """Admin records an offline payment and enrolls a student directly.

        Mirrors the Razorpay verification flow: create a PAID payment record,
        then create the enrollment through the standard enrollment service so
        the student gets normal course access. No Razorpay calls are made.
        """
        course = await crud_course.get(
            db=session,
            id=course_id,
            is_deleted=False,
            schema_to_select=CourseRead,
            return_as_model=True,
        )
        if not course:
            raise NotFoundException(
                resource="Course",
                identifier=str(course_id),
                error_code=ErrorCode.COURSE_NOT_FOUND,
            )

        user = await crud_user_payment.get(
            db=session,
            id=user_id,
            is_deleted=False,
            schema_to_select=UserRead,
            return_as_model=True,
        )
        if not user:
            raise NotFoundException(
                resource="User",
                identifier=str(user_id),
                error_code=ErrorCode.USER_NOT_FOUND,
            )

        already_enrolled = await crud_course_enrollment.exists(
            db=session, user_id=user_id, course_id=course_id
        )
        if already_enrolled:
            raise ConflictException(
                message="This student is already enrolled in this course",
                error_code=ErrorCode.ENROLLMENT_ALREADY_EXISTS,
            )

        try:
            payment = await crud_course_payment.create(
                db=session,
                object=CoursePaymentCreate(
                    user_id=user_id,
                    course_id=course_id,
                    amount=amount_paid,
                    razorpay_order_id=None,
                    status=CoursePaymentStatus.PAID,
                ),
                schema_to_select=CoursePaymentRead,
                return_as_model=True,
                commit=False,
            )

            await crud_course_payment.update(
                db=session,
                id=payment.id,
                object={
                    "payment_method": "direct",
                    "paid_at": datetime.now(UTC),
                    "admin_note": note,
                },
                commit=False,
            )

            enrollment = await enrollment_service.enroll(
                session=session, user_id=user_id, course_id=course_id
            )
            await session.commit()

            try:
                await send_course_purchase_email(
                    user=user,
                    course_title=course.title,
                    course_slug=course.slug,
                )
            except Exception:
                pass

            return enrollment

        except Exception as exc:
            await session.rollback()
            raise ServiceException(
                "Course Payment",
                f"Failed to create direct enrollment: {exc}",
            ) from exc

    async def list_course_enrolled_students(
        self,
        *,
        session: AsyncSession,
        course_id: uuid.UUID,
    ) -> list[AdminEnrolledStudentRead]:
        """Enrolled students for a course with user + payment + progress info."""
        stmt = (
            select(
                CourseEnrollment,
                User.full_name.label("user_full_name"),
                User.email.label("user_email"),
                CoursePayment.amount.label("amount_paid"),
                CoursePayment.payment_method.label("payment_method"),
                CoursePayment.status.label("payment_status"),
                CoursePayment.paid_at.label("paid_at"),
                CoursePayment.admin_note.label("payment_note"),
            )
            .join(User, User.id == CourseEnrollment.user_id)
            .outerjoin(
                CoursePayment,
                and_(
                    CoursePayment.user_id == CourseEnrollment.user_id,
                    CoursePayment.course_id == CourseEnrollment.course_id,
                    CoursePayment.status == CoursePaymentStatus.PAID,
                ),
            )
            .where(
                CourseEnrollment.course_id == course_id,
                CourseEnrollment.is_active.is_(True),
                User.is_deleted.is_(False),
            )
            .order_by(CourseEnrollment.created_at.desc())
        )
        rows = (await session.execute(stmt)).all()

        enrolled: list[AdminEnrolledStudentRead] = []
        for row in rows:
            enrollment = row[0]
            try:
                progress = await progress_service.get_course_progress(
                    session=session,
                    user_id=enrollment.user_id,
                    course_id=course_id,
                )
                progress_percentage = progress.progress_percentage
            except Exception:
                progress_percentage = None

            enrolled.append(
                AdminEnrolledStudentRead(
                    id=enrollment.id,
                    user_id=enrollment.user_id,
                    course_id=enrollment.course_id,
                    enrolled_at=enrollment.enrolled_at,
                    completed_at=enrollment.completed_at,
                    expires_at=enrollment.expires_at,
                    is_active=enrollment.is_active,
                    created_at=enrollment.created_at,
                    updated_at=enrollment.updated_at,
                    user_full_name=row.user_full_name,
                    user_email=row.user_email,
                    amount_paid=row.amount_paid,
                    payment_method=row.payment_method,
                    payment_status=row.payment_status,
                    paid_at=row.paid_at,
                    admin_note=row.payment_note,
                    progress_percentage=progress_percentage,
                )
            )

        return enrolled

    async def list_course_payments(
        self,
        *,
        session: AsyncSession,
        page: int = 1,
        page_size: int = 10,
        search: str | None = None,
        status: str | None = None,
        date_start: datetime | None = None,
        date_end: datetime | None = None,
        min_amount: Decimal | None = None,
        max_amount: Decimal | None = None,
    ) -> GetMultiResponseModel[AdminCoursePaymentRead]:
        filters: dict = {}

        if status:
            filters["status"] = status

        if date_start and date_end:
            filters["created_at__gte"] = date_start
            filters["created_at__lt"] = date_end + timedelta(days=1)

        if min_amount is not None:
            filters["amount__gte"] = min_amount

        if max_amount is not None:
            filters["amount__lte"] = max_amount

        if search:
            like = f"%{search}%"
            filters["_or"] = {
                "razorpay_order_id__ilike": like,
                "user.full_name__ilike": like,
                "user.email__ilike": like,
                "course.title__ilike": like,
            }

        result = await crud_course_payment.get_multi_joined(
            db=session,
            schema_to_select=AdminCoursePaymentRead,
            joins_config=[
                JoinConfig(
                    model=User,
                    join_on=CoursePayment.user_id == User.id,
                    join_type="left",
                    join_prefix="user_",
                ),
                JoinConfig(
                    model=Course,
                    join_on=CoursePayment.course_id == Course.id,
                    join_type="left",
                    join_prefix="course_",
                ),
            ],
            offset=compute_offset(page, page_size),
            limit=page_size,
            sort_columns=["created_at"],
            sort_orders=["desc"],
            return_total_count=True,
            **filters,
        )

        return result


course_payment_service = CoursePaymentService()
