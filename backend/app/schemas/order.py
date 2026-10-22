from datetime import datetime
from decimal import Decimal
from urllib.parse import urlparse
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.schema import TimestampSchemaRead
from app.models.order import OrderStatus, PaymentStatus
from app.schemas.address import AddressRead
from app.schemas.user import PublicUserRead

# ─── OrderItem Schemas ──────────────────────────────────────────────────────


class OrderItemBase(BaseModel):
    product_id: UUID | None = None
    variant_id: UUID | None = None
    course_id: UUID | None = None
    quantity: int = 1
    price: Decimal


class OrderItemCreate(OrderItemBase):
    order_id: UUID


class OrderItemRead(OrderItemBase):
    id: int
    order_id: UUID
    model_config = ConfigDict(from_attributes=True)


class OrderItemDetailRead(OrderItemRead):
    course_title: str | None = None
    course_slug: str | None = None
    product_title: str | None = None
    product_image: str | None = None
    variant_name: str | None = None
    variant_dimensions: str | None = None


# ─── Order Schemas ──────────────────────────────────────────────────────────


class OrderBase(BaseModel):
    shipping_address_id: int | None = None
    billing_address_id: int | None = None
    payment_method: str = "razorpay"


class OrderCreateDB(OrderBase):
    user_id: UUID
    total_amount: Decimal


class OrderCreate(OrderBase):
    items: list[OrderItemBase]
    coupon_code: str | None = None


class OrderUpdate(BaseModel):
    status: OrderStatus | None = None
    payment_status: PaymentStatus | None = None
    razorpay_payment_id: str | None = None
    razorpay_signature: str | None = None


class OrderShipRequest(BaseModel):
    courier_name: str = Field(..., min_length=1, max_length=100)
    tracking_number: str = Field(..., min_length=1, max_length=100)
    tracking_url: str | None = Field(None, max_length=500)
    shipping_note: str | None = Field(None, max_length=2000)

    @field_validator("courier_name", "tracking_number", mode="before")
    @classmethod
    def strip_required_fields(cls, value):
        if isinstance(value, str):
            value = value.strip()
        return value

    @field_validator("tracking_url", mode="before")
    @classmethod
    def validate_tracking_url(cls, value):
        if value is None:
            return None
        value = value.strip()
        if not value:
            return None
        parsed = urlparse(value)
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            raise ValueError("Tracking URL must be a valid http/https URL")
        return value

    @field_validator("shipping_note", mode="before")
    @classmethod
    def strip_shipping_note(cls, value):
        if isinstance(value, str):
            value = value.strip()
            if not value:
                return None
        return value


class OrderRead(OrderBase, TimestampSchemaRead):
    id: UUID
    user_id: UUID
    status: OrderStatus
    payment_status: PaymentStatus
    razorpay_order_id: str | None = None
    total_amount: Decimal
    courier_name: str | None = None
    tracking_number: str | None = None
    tracking_url: str | None = None
    shipping_note: str | None = None
    shipped_at: datetime | None = None
    items: list[OrderItemRead] = []

    model_config = ConfigDict(from_attributes=True)


class AdminOrderRead(OrderRead):
    user: PublicUserRead | None = None


class AdminOrderDetailRead(OrderRead):
    user: PublicUserRead | None = None
    items: list[OrderItemDetailRead] = []
    shipping_address: AddressRead | None = None


class OrderDashboardRead(TimestampSchemaRead):
    id: UUID
    user: PublicUserRead | None = None
    total_amount: Decimal
    status: OrderStatus
    payment_status: PaymentStatus
    item_count: int | None = 0

    model_config = ConfigDict(from_attributes=True)


class OrderListParams(BaseModel):
    page: int = Field(1, ge=1)
    page_size: int = Field(10, ge=1)
    search: str | None = None
    status: OrderStatus | None = None
    payment_status: PaymentStatus | None = None
    date_start: datetime | None = None
    date_end: datetime | None = None
    min_amount: Decimal | None = Field(None, ge=0)
    max_amount: Decimal | None = Field(None, ge=0)

    model_config = {"extra": "forbid"}


# ─── Razorpay Verification ──────────────────────────────────────────────────


class PaymentVerificationRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
