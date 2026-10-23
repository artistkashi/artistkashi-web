from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.crud.base import BaseCRUD
from app.models.coupon import Coupon, CouponCourse, CouponPainting, CouponUsage
from app.models.course_payment import CoursePayment


class CRUDCoupon(BaseCRUD):
    async def lock_for_redemption(
        self, db: AsyncSession, coupon_id: uuid.UUID
    ) -> Coupon | None:
        """Lock the coupon row while rechecking and recording a redemption.

        FastCRUD's public `get` does not expose SELECT FOR UPDATE. Keep this
        PostgreSQL-specific concurrency primitive inside the coupon CRUD layer.
        """
        result = await db.execute(
            select(Coupon).where(Coupon.id == coupon_id).with_for_update()
        )
        return result.scalar_one_or_none()

    async def get_courses_for_coupon(
        self,
        db: AsyncSession,
        coupon_id: uuid.UUID,
    ) -> list[uuid.UUID]:
        """Get course IDs associated with a coupon."""
        stmt = await crud_coupon_course.select(coupon_id=coupon_id)
        result = await db.execute(stmt)
        return [row.course_id for row in result.all()]

    async def get_paintings_for_coupon(
        self,
        db: AsyncSession,
        coupon_id: uuid.UUID,
    ) -> list[uuid.UUID]:
        """Get painting IDs associated with a coupon."""
        stmt = await crud_coupon_painting.select(coupon_id=coupon_id)
        result = await db.execute(stmt)
        return [row.product_id for row in result.all()]

    async def set_coupon_courses(
        self,
        db: AsyncSession,
        coupon_id: uuid.UUID,
        course_ids: list[uuid.UUID],
    ) -> None:
        """Set courses for a coupon (replace existing)."""
        await crud_coupon_course.db_delete(
            db,
            allow_multiple=True,
            commit=False,
            coupon_id=coupon_id,
        )
        await crud_coupon_course.create_multi(
            db,
            objects=[
                {"coupon_id": coupon_id, "course_id": course_id}
                for course_id in course_ids
            ],
            commit=False,
        )

    async def set_coupon_paintings(
        self,
        db: AsyncSession,
        coupon_id: uuid.UUID,
        painting_ids: list[uuid.UUID],
    ) -> None:
        """Set paintings for a coupon (replace existing)."""
        await crud_coupon_painting.db_delete(
            db,
            allow_multiple=True,
            commit=False,
            coupon_id=coupon_id,
        )
        await crud_coupon_painting.create_multi(
            db,
            objects=[
                {"coupon_id": coupon_id, "product_id": painting_id}
                for painting_id in painting_ids
            ],
            commit=False,
        )


class CRUDCouponUsage(BaseCRUD):
    async def get_usage_by_coupon(
        self,
        db: AsyncSession,
        coupon_id: uuid.UUID,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[CouponUsage], int, Decimal]:
        """Get history and lifetime redemption totals for a coupon."""
        offset = (page - 1) * page_size
        stmt = (
            select(CouponUsage)
            .where(CouponUsage.coupon_id == coupon_id)
            .options(
                joinedload(CouponUsage.user),
                joinedload(CouponUsage.course_payment).joinedload(CoursePayment.course),
            )
            .order_by(CouponUsage.used_at.desc())
            .offset(offset)
            .limit(page_size)
        )
        result = await db.execute(stmt)
        usages = list(result.scalars().all())

        summary_stmt = select(
            func.count(CouponUsage.id),
            func.coalesce(func.sum(CouponUsage.discount_amount), 0),
        ).where(CouponUsage.coupon_id == coupon_id)
        summary_result = await db.execute(summary_stmt)
        total, total_discount_amount = summary_result.one()

        return usages, total, Decimal(str(total_discount_amount))


crud_coupon = CRUDCoupon(Coupon)
crud_coupon_course = BaseCRUD(CouponCourse)
crud_coupon_painting = BaseCRUD(CouponPainting)
crud_coupon_usage = CRUDCouponUsage(CouponUsage)
