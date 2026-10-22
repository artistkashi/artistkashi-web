from __future__ import annotations

import enum
import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.coupon import Coupon


class CoursePaymentStatus(enum.StrEnum):
    PENDING = "pending"
    PAID = "paid"
    FAILED = "failed"
    REFUNDED = "refunded"


class CoursePayment(Base, TimestampMixin):
    __tablename__ = "course_payments"

    id: Mapped[uuid.UUID] = mapped_column(default=uuid.uuid4, primary_key=True)

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    course_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Payment source: "razorpay" (online checkout) or "direct" (admin-recorded
    # offline payment). Follows the Order.payment_method convention.
    payment_method: Mapped[str] = mapped_column(
        String(50), default="razorpay", nullable=False
    )

    razorpay_order_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True, unique=True, index=True
    )

    razorpay_payment_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    razorpay_signature: Mapped[str | None] = mapped_column(String(500), nullable=True)

    subtotal: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, default=Decimal("0")
    )

    discount_amount: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), default=Decimal("0"), nullable=False
    )

    gateway_fee: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), default=Decimal("0"), nullable=False
    )

    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    coupon_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("coupons.id", ondelete="SET NULL"), nullable=True, index=True
    )

    coupon_code: Mapped[str | None] = mapped_column(String(50), nullable=True)

    status: Mapped[CoursePaymentStatus] = mapped_column(
        Enum(
            CoursePaymentStatus,
            values_callable=lambda obj: [e.value for e in obj],
            name="coursepaymentstatus",
        ),
        default=CoursePaymentStatus.PENDING,
        nullable=False,
    )

    paid_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    admin_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    user = relationship("User", back_populates="course_payments")
    course = relationship("Course", back_populates="payments")
    coupon = relationship("Coupon")
