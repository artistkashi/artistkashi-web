from __future__ import annotations

import enum
import uuid
from datetime import UTC, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.course import Course
    from app.models.course_payment import CoursePayment
    from app.models.order import Order
    from app.models.product import Product
    from app.models.user import User


class DiscountType(enum.StrEnum):
    PERCENTAGE = "percentage"
    FIXED = "fixed"


class AppliesTo(enum.StrEnum):
    ALL = "all"
    COURSES = "courses"
    PAINTINGS = "paintings"
    SELECTED_COURSES = "selected_courses"
    SELECTED_PAINTINGS = "selected_paintings"


class RestrictionType(enum.StrEnum):
    ALL_ELIGIBLE = "all_eligible"
    SELECTED_PRODUCTS = "selected_products"


class Coupon(Base, TimestampMixin):
    __tablename__ = "coupons"

    id: Mapped[uuid.UUID] = mapped_column(default=uuid.uuid4, primary_key=True)

    # The coupon migration declares updated_at NOT NULL. TimestampMixin's
    # default is None, so coupon rows need an insert-time value explicitly.
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    code: Mapped[str] = mapped_column(
        String(50), unique=True, nullable=False, index=True
    )

    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    discount_type: Mapped[DiscountType] = mapped_column(
        Enum(
            DiscountType, values_callable=lambda enum_cls: [e.value for e in enum_cls]
        ),
        nullable=False,
    )

    discount_value: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    max_discount: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)

    applies_to: Mapped[AppliesTo] = mapped_column(
        Enum(AppliesTo, values_callable=lambda enum_cls: [e.value for e in enum_cls]),
        nullable=False,
    )

    restriction_type: Mapped[RestrictionType] = mapped_column(
        Enum(
            RestrictionType,
            values_callable=lambda enum_cls: [e.value for e in enum_cls],
        ),
        nullable=False,
        default=RestrictionType.ALL_ELIGIBLE,
    )

    min_order_amount: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), default=Decimal("0"), nullable=False
    )

    starts_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    usage_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)

    usage_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    per_user_limit: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)

    # Relationships
    courses: Mapped[list[CouponCourse]] = relationship(
        "CouponCourse", back_populates="coupon", cascade="all, delete-orphan"
    )

    paintings: Mapped[list[CouponPainting]] = relationship(
        "CouponPainting", back_populates="coupon", cascade="all, delete-orphan"
    )

    usages: Mapped[list[CouponUsage]] = relationship(
        "CouponUsage", back_populates="coupon", cascade="all, delete-orphan"
    )


class CouponCourse(Base, TimestampMixin):
    __tablename__ = "coupon_courses"

    __table_args__ = (
        UniqueConstraint("coupon_id", "course_id", name="uq_coupon_course"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    coupon_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("coupons.id", ondelete="CASCADE"), nullable=False, index=True
    )

    course_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True
    )

    coupon: Mapped[Coupon] = relationship("Coupon", back_populates="courses")
    course: Mapped[Course] = relationship("Course")


class CouponPainting(Base, TimestampMixin):
    __tablename__ = "coupon_paintings"

    __table_args__ = (
        UniqueConstraint("coupon_id", "product_id", name="uq_coupon_painting"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    coupon_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("coupons.id", ondelete="CASCADE"), nullable=False, index=True
    )

    product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True
    )

    coupon: Mapped[Coupon] = relationship("Coupon", back_populates="paintings")
    product: Mapped[Product] = relationship("Product")


class CouponUsage(Base, TimestampMixin):
    __tablename__ = "coupon_usages"
    __table_args__ = (
        Index(
            "uq_coupon_usage_order",
            "order_id",
            unique=True,
            postgresql_where=text("order_id IS NOT NULL"),
        ),
        Index(
            "uq_coupon_usage_course_payment",
            "course_payment_id",
            unique=True,
            postgresql_where=text("course_payment_id IS NOT NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(default=uuid.uuid4, primary_key=True)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    coupon_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("coupons.id", ondelete="CASCADE"), nullable=False, index=True
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    order_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True
    )

    course_payment_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("course_payments.id", ondelete="SET NULL"), nullable=True, index=True
    )

    discount_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    used_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now()
    )

    coupon: Mapped[Coupon] = relationship("Coupon", back_populates="usages")
    user: Mapped[User] = relationship("User")
    order: Mapped[Order | None] = relationship("Order")
    course_payment: Mapped[CoursePayment | None] = relationship("CoursePayment")
