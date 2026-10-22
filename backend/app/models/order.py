from __future__ import annotations

import enum
import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.coupon import Coupon


class OrderStatus(enum.StrEnum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    SHIPPED = "shipped"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"


class PaymentStatus(enum.StrEnum):
    PENDING = "pending"
    PAID = "paid"
    FAILED = "failed"
    REFUNDED = "refunded"


class Order(Base, TimestampMixin):
    __tablename__ = "orders"

    id: Mapped[uuid.UUID] = mapped_column(default=uuid.uuid4, primary_key=True)

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey(
            "users.id",
            ondelete="CASCADE",
        ),
        index=True,
    )

    subtotal: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, default=Decimal("0")
    )

    discount_amount: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), default=Decimal("0"), nullable=False
    )

    gateway_fee: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), default=Decimal("0"), nullable=False
    )

    total_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    coupon_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("coupons.id", ondelete="SET NULL"), nullable=True, index=True
    )

    coupon_code: Mapped[str | None] = mapped_column(String(50), nullable=True)

    status: Mapped[OrderStatus] = mapped_column(
        Enum(
            OrderStatus,
            values_callable=lambda obj: [e.value for e in obj],
            name="orderstatus",
        ),
        default=OrderStatus.PENDING,
        nullable=False,
    )

    payment_status: Mapped[PaymentStatus] = mapped_column(
        Enum(
            PaymentStatus,
            values_callable=lambda obj: [e.value for e in obj],
            name="paymentstatus",
        ),
        default=PaymentStatus.PENDING,
        nullable=False,
    )

    payment_method: Mapped[str] = mapped_column(String(50), default="razorpay")

    razorpay_order_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    razorpay_payment_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    razorpay_signature: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Shipment details
    courier_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    tracking_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    tracking_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    shipping_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    shipped_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    shipping_address_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("addresses.id", ondelete="SET NULL"), nullable=True
    )
    billing_address_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("addresses.id", ondelete="SET NULL"), nullable=True
    )

    # Relationships
    user = relationship("User", back_populates="orders")
    items = relationship(
        "OrderItem", back_populates="order", cascade="all, delete-orphan"
    )
    shipping_address = relationship("Address", foreign_keys=[shipping_address_id])
    billing_address = relationship("Address", foreign_keys=[billing_address_id])
    coupon = relationship("Coupon")


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), index=True
    )

    product_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("products.id", ondelete="SET NULL"), nullable=True
    )
    variant_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("product_variants.id", ondelete="SET NULL"), nullable=True
    )
    course_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("courses.id", ondelete="SET NULL"), nullable=True
    )

    quantity: Mapped[int] = mapped_column(Integer, default=1)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    # Relationships
    order = relationship("Order", back_populates="items")
    product = relationship("Product")
    variant = relationship("ProductVariant")
    course = relationship("Course")
