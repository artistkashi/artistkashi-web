from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Query

from app.api.dependencies import CurrentAdminDep, DatabaseDep
from app.core.exceptions import (
    ConflictException,
    ErrorCode,
    NotFoundException,
    ValidationException,
)
from app.crud.coupon import crud_coupon, crud_coupon_usage
from app.crud.course import crud_course
from app.crud.product import crud_product
from app.models.coupon import AppliesTo, Coupon, DiscountType, RestrictionType
from app.schemas.coupon import (
    AdminCouponCreate,
    AdminCouponListRead,
    AdminCouponRead,
    AdminCouponUpdate,
    AdminCouponUsageListRead,
    AdminCouponUsageRead,
    CouponCreate,
)
from app.schemas.responses import PaginatedResponse, Pagination, SuccessResponse

router = APIRouter(prefix="/coupons", tags=["admin-coupons"])


def _build_admin_coupon_read(coupon: Coupon) -> AdminCouponRead:
    """Build AdminCouponRead from a Coupon ORM instance."""
    return AdminCouponRead(
        id=coupon.id,
        code=coupon.code,
        description=coupon.description,
        discount_type=coupon.discount_type.value,
        discount_value=coupon.discount_value,
        max_discount=coupon.max_discount,
        applies_to=coupon.applies_to.value,
        restriction_type=coupon.restriction_type.value,
        min_order_amount=coupon.min_order_amount,
        usage_limit=coupon.usage_limit,
        usage_count=coupon.usage_count,
        per_user_limit=coupon.per_user_limit,
        is_active=coupon.is_active,
        starts_at=coupon.starts_at,
        expires_at=coupon.expires_at,
        created_at=coupon.created_at,
        updated_at=coupon.updated_at,
    )


@router.post("", response_model=SuccessResponse[AdminCouponRead])
async def create_coupon(
    payload: AdminCouponCreate,
    session: DatabaseDep,
    _: CurrentAdminDep,
) -> SuccessResponse[AdminCouponRead]:
    """Create a new coupon."""
    code = payload.code.strip().upper()

    existing = await crud_coupon.get(session, code=code)
    if existing:
        raise ConflictException(
            message="A coupon with this code already exists.",
            error_code=ErrorCode.COUPON_ALREADY_EXISTS,
        )

    coupon_data = CouponCreate(
        code=code,
        description=payload.description,
        discount_type=DiscountType(payload.discount_type.value),
        discount_value=payload.discount_value,
        max_discount=payload.max_discount,
        applies_to=AppliesTo(payload.applies_to.value),
        restriction_type=RestrictionType(payload.restriction_type.value),
        min_order_amount=payload.min_order_amount,
        usage_limit=payload.usage_limit,
        per_user_limit=payload.per_user_limit,
        starts_at=payload.starts_at,
        expires_at=payload.expires_at,
        is_active=payload.is_active,
    )

    coupon = await crud_coupon.create(
        db=session,
        object=coupon_data,
        commit=False,
    )
    # FastCRUD returns None when commit=False; retrieve the pending row so we
    # can attach selected products in the same transaction.
    coupon = await crud_coupon.get_with_relations(
        session, relationships=[], code=code
    )
    assert coupon is not None

    # Validate and set course relations
    if payload.course_ids:
        # Verify all courses exist
        courses = await crud_course.get_multi(
            db=session,
            id__in=payload.course_ids,
            is_deleted=False,
            is_published=True,
        )
        course_rows = courses["data"]
        if len(course_rows) != len(payload.course_ids):
            found_ids = {course.id for course in course_rows}
            missing_ids = [cid for cid in payload.course_ids if cid not in found_ids]
            raise ValidationException(
                message=f"Courses not found: {missing_ids}",
                error_code=ErrorCode.COURSE_NOT_FOUND,
            )
        await crud_coupon.set_coupon_courses(session, coupon.id, payload.course_ids)

    # Validate and set painting relations
    if payload.painting_ids:
        # Verify all paintings exist
        paintings = await crud_product.get_multi(
            db=session,
            id__in=payload.painting_ids,
        )
        painting_rows = paintings["data"]
        if len(painting_rows) != len(payload.painting_ids):
            found_ids = {painting.id for painting in painting_rows}
            missing_ids = [pid for pid in payload.painting_ids if pid not in found_ids]
            raise ValidationException(
                message=f"Paintings not found: {missing_ids}",
                error_code=ErrorCode.PRODUCT_NOT_FOUND,
            )
        await crud_coupon.set_coupon_paintings(session, coupon.id, payload.painting_ids)

    if payload.restriction_type == RestrictionType.SELECTED_PRODUCTS:
        selected_course = payload.applies_to in (
            AppliesTo.COURSES,
            AppliesTo.SELECTED_COURSES,
        )
        selected_painting = payload.applies_to in (
            AppliesTo.PAINTINGS,
            AppliesTo.SELECTED_PAINTINGS,
        )
        if selected_course and not payload.course_ids:
            raise ValidationException("Select at least one eligible course")
        if selected_painting and not payload.painting_ids:
            raise ValidationException("Select at least one eligible painting")
    if (
        payload.expires_at
        and payload.starts_at
        and payload.expires_at <= payload.starts_at
    ):
        raise ValidationException("Expiry must be later than the start date")
    await session.commit()

    # Reload with relations
    coupon = await crud_coupon.get_with_relations(
        session, relationships=["courses", "paintings"], id=coupon.id
    )
    assert coupon is not None

    course_ids = await crud_coupon.get_courses_for_coupon(session, coupon.id)
    painting_ids = await crud_coupon.get_paintings_for_coupon(session, coupon.id)

    admin_read = _build_admin_coupon_read(coupon)
    admin_read.course_ids = course_ids
    admin_read.painting_ids = painting_ids

    return SuccessResponse(
        message="Coupon created successfully",
        data=admin_read,
    )


@router.get("", response_model=SuccessResponse[PaginatedResponse[AdminCouponListRead]])
async def list_coupons(
    session: DatabaseDep,
    _: CurrentAdminDep,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    search: str | None = Query(None),
    is_active: bool | None = Query(None),
    applies_to: str | None = Query(None),
) -> SuccessResponse[PaginatedResponse[AdminCouponListRead]]:
    """List coupons with pagination and filters."""
    filters: dict[str, object] = {}
    if search:
        filters["code__ilike"] = f"%{search}%"
    if is_active is not None:
        filters["is_active"] = is_active
    if applies_to:
        filters["applies_to"] = applies_to

    result = await crud_coupon.get_multi(
        db=session,
        offset=(page - 1) * page_size,
        limit=page_size,
        sort_columns=["created_at"],
        sort_orders=["desc"],
        return_total_count=True,
        **filters,
    )

    coupons = []
    for coupon in result["data"]:
        coupons.append(
            AdminCouponListRead(
                id=coupon["id"],
                code=coupon["code"],
                discount_type=coupon["discount_type"],
                discount_value=coupon["discount_value"],
                max_discount=coupon["max_discount"],
                applies_to=coupon["applies_to"],
                restriction_type=coupon["restriction_type"],
                min_order_amount=coupon["min_order_amount"],
                usage_limit=coupon["usage_limit"],
                usage_count=coupon["usage_count"],
                per_user_limit=coupon["per_user_limit"],
                is_active=coupon["is_active"],
                starts_at=coupon["starts_at"],
                expires_at=coupon["expires_at"],
                created_at=coupon["created_at"],
                updated_at=coupon["updated_at"],
            )
        )

    total_count = result.get("total_count", 0)
    total_pages = (total_count + page_size - 1) // page_size if page_size else 1

    return SuccessResponse(
        message="Coupons retrieved successfully",
        data=PaginatedResponse(
            message="Coupons retrieved successfully",
            data=coupons,
            pagination=Pagination(
                page=page,
                page_size=page_size,
                total_items=total_count,
                total_pages=total_pages,
                has_next=page < total_pages,
                has_prev=page > 1,
            ),
        ),
    )


@router.get("/{coupon_id}", response_model=SuccessResponse[AdminCouponRead])
async def get_coupon(
    coupon_id: uuid.UUID,
    session: DatabaseDep,
    _: CurrentAdminDep,
) -> SuccessResponse[AdminCouponRead]:
    """Get coupon details with relations."""
    coupon = await crud_coupon.get_with_relations(
        session, relationships=["courses", "paintings"], id=coupon_id
    )
    if not coupon:
        raise NotFoundException(
            "Coupon", coupon_id, error_code=ErrorCode.COUPON_NOT_FOUND
        )

    course_ids = await crud_coupon.get_courses_for_coupon(session, coupon.id)
    painting_ids = await crud_coupon.get_paintings_for_coupon(session, coupon.id)

    admin_read = _build_admin_coupon_read(coupon)
    admin_read.course_ids = course_ids
    admin_read.painting_ids = painting_ids

    return SuccessResponse(
        message="Coupon retrieved successfully",
        data=admin_read,
    )


@router.patch("/{coupon_id}", response_model=SuccessResponse[AdminCouponRead])
async def update_coupon(
    coupon_id: uuid.UUID,
    payload: AdminCouponUpdate,
    session: DatabaseDep,
    _: CurrentAdminDep,
) -> SuccessResponse[AdminCouponRead]:
    """Update a coupon."""
    coupon = await crud_coupon.get_with_relations(
        session, relationships=[], id=coupon_id
    )
    if not coupon:
        raise NotFoundException(
            "Coupon", coupon_id, error_code=ErrorCode.COUPON_NOT_FOUND
        )

    update_data = payload.model_dump(exclude_unset=True)

    # Handle course_ids and painting_ids separately
    course_ids = update_data.pop("course_ids", None)
    painting_ids = update_data.pop("painting_ids", None)

    effective_type = update_data.get("discount_type", coupon.discount_type)
    effective_value = update_data.get("discount_value", coupon.discount_value)
    if (
        effective_type in (DiscountType.PERCENTAGE, "percentage")
        and effective_value > 100
    ):
        raise ValidationException("Percentage discount cannot exceed 100%")
    effective_applies = update_data.get("applies_to", coupon.applies_to)
    effective_restriction = update_data.get("restriction_type", coupon.restriction_type)
    effective_courses = (
        course_ids
        if course_ids is not None
        else await crud_coupon.get_courses_for_coupon(session, coupon_id)
    )
    effective_paintings = (
        painting_ids
        if painting_ids is not None
        else await crud_coupon.get_paintings_for_coupon(session, coupon_id)
    )
    effective_starts = update_data.get("starts_at", coupon.starts_at)
    effective_expires = update_data.get("expires_at", coupon.expires_at)
    if effective_starts and effective_expires and effective_expires <= effective_starts:
        raise ValidationException("Expiry must be later than the start date")
    if (
        effective_applies in (AppliesTo.SELECTED_COURSES, "selected_courses")
        and not effective_courses
    ):
        raise ValidationException("Select at least one eligible course")
    if (
        effective_applies in (AppliesTo.SELECTED_PAINTINGS, "selected_paintings")
        and not effective_paintings
    ):
        raise ValidationException("Select at least one eligible painting")
    if effective_restriction in (
        RestrictionType.SELECTED_PRODUCTS,
        "selected_products",
    ):
        if (
            effective_applies in (AppliesTo.ALL, "all")
            and not effective_courses
            and not effective_paintings
        ):
            raise ValidationException("Select at least one eligible course or painting")
        if (
            effective_applies
            in (
                AppliesTo.COURSES,
                AppliesTo.SELECTED_COURSES,
                "courses",
                "selected_courses",
            )
            and not effective_courses
        ):
            raise ValidationException("Select at least one eligible course")
        if (
            effective_applies
            in (
                AppliesTo.PAINTINGS,
                AppliesTo.SELECTED_PAINTINGS,
                "paintings",
                "selected_paintings",
            )
            and not effective_paintings
        ):
            raise ValidationException("Select at least one eligible painting")

    # Apply updates
    for key, value in update_data.items():
        setattr(coupon, key, value)

    # Update course relations if provided
    if course_ids is not None:
        # Verify all courses exist
        if course_ids:
            courses = await crud_course.get_multi(
                db=session,
                id__in=course_ids,
                is_deleted=False,
                is_published=True,
            )
            course_rows = courses["data"]
            if len(course_rows) != len(course_ids):
                found_ids = {course.id for course in course_rows}
                missing_ids = [cid for cid in course_ids if cid not in found_ids]
                raise ValidationException(
                    message=f"Courses not found: {missing_ids}",
                    error_code=ErrorCode.COURSE_NOT_FOUND,
                )
        await crud_coupon.set_coupon_courses(session, coupon_id, course_ids)

    if painting_ids is not None:
        # Verify all paintings exist
        if painting_ids:
            paintings = await crud_product.get_multi(
                db=session,
                id__in=painting_ids,
            )
            painting_rows = paintings["data"]
            if len(painting_rows) != len(painting_ids):
                found_ids = {painting.id for painting in painting_rows}
                missing_ids = [pid for pid in painting_ids if pid not in found_ids]
                raise ValidationException(
                    message=f"Paintings not found: {missing_ids}",
                    error_code=ErrorCode.PRODUCT_NOT_FOUND,
                )
        await crud_coupon.set_coupon_paintings(session, coupon_id, painting_ids)

    await session.commit()

    # Reload with relations
    coupon = await crud_coupon.get_with_relations(
        session, relationships=["courses", "paintings"], id=coupon_id
    )
    assert coupon is not None

    rel_course_ids = await crud_coupon.get_courses_for_coupon(session, coupon.id)
    rel_painting_ids = await crud_coupon.get_paintings_for_coupon(session, coupon.id)

    admin_read = _build_admin_coupon_read(coupon)
    admin_read.course_ids = rel_course_ids
    admin_read.painting_ids = rel_painting_ids

    return SuccessResponse(
        message="Coupon updated successfully",
        data=admin_read,
    )


@router.delete("/{coupon_id}", response_model=SuccessResponse[None])
async def delete_coupon(
    coupon_id: uuid.UUID,
    session: DatabaseDep,
    _: CurrentAdminDep,
) -> SuccessResponse[None]:
    """Deactivate a coupon (soft delete)."""
    coupon = await crud_coupon.get_with_relations(
        session, relationships=[], id=coupon_id
    )
    if not coupon:
        raise NotFoundException(
            "Coupon", coupon_id, error_code=ErrorCode.COUPON_NOT_FOUND
        )

    coupon.is_active = False
    await session.commit()

    return SuccessResponse(message="Coupon deactivated successfully")


@router.get(
    "/{coupon_id}/usage", response_model=SuccessResponse[AdminCouponUsageListRead]
)
async def get_coupon_usage(
    coupon_id: uuid.UUID,
    session: DatabaseDep,
    _: CurrentAdminDep,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> SuccessResponse[AdminCouponUsageListRead]:
    """Get coupon usage history."""
    coupon = await crud_coupon.get_with_relations(
        session, relationships=[], id=coupon_id
    )
    if not coupon:
        raise NotFoundException(
            "Coupon", coupon_id, error_code=ErrorCode.COUPON_NOT_FOUND
        )

    usages, total, total_discount_amount = await crud_coupon_usage.get_usage_by_coupon(
        db=session,
        coupon_id=coupon_id,
        page=page,
        page_size=page_size,
    )

    usage_reads: list[AdminCouponUsageRead] = []
    for usage in usages:
        order_number = None
        course_title = None

        if usage.order_id:
            order_number = f"#{str(usage.order_id)[:8].upper()}"

        if usage.course_payment and usage.course_payment.course:
            course_title = usage.course_payment.course.title

        usage_reads.append(
            AdminCouponUsageRead(
                id=usage.id,
                user_id=usage.user_id,
                user_full_name=usage.user.full_name if usage.user else None,
                user_email=usage.user.email if usage.user else None,
                order_id=usage.order_id,
                course_payment_id=usage.course_payment_id,
                discount_amount=usage.discount_amount,
                used_at=usage.used_at,
                order_number=order_number,
                course_title=course_title,
            )
        )

    return SuccessResponse(
        message="Coupon usage retrieved successfully",
        data=AdminCouponUsageListRead(
            coupon_code=coupon.code,
            coupon_id=coupon_id,
            total_usage=coupon.usage_count,
            total_discount_amount=total_discount_amount,
            usage_limit=coupon.usage_limit,
            page=page,
            page_size=page_size,
            total_items=total,
            total_pages=(total + page_size - 1) // page_size,
            usages=usage_reads,
        ),
    )
