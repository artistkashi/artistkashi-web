from __future__ import annotations

import enum
import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.schema import TimestampSchemaRead

# ─── Enums for API ──────────────────────────────────────────────────────────────


class DiscountTypeAPI(enum.StrEnum):
    PERCENTAGE = "percentage"
    FIXED = "fixed"


class AppliesToAPI(enum.StrEnum):
    ALL = "all"
    COURSES = "courses"
    PAINTINGS = "paintings"
    SELECTED_COURSES = "selected_courses"
    SELECTED_PAINTINGS = "selected_paintings"


class RestrictionTypeAPI(enum.StrEnum):
    ALL_ELIGIBLE = "all_eligible"
    SELECTED_PRODUCTS = "selected_products"


# ─── Coupon Schemas ─────────────────────────────────────────────────────────────


class CouponBase(BaseModel):
    code: str = Field(..., min_length=1, max_length=50)
    description: str | None = Field(None, max_length=1000)

    discount_type: DiscountTypeAPI
    discount_value: Decimal = Field(..., gt=0, decimal_places=2, max_digits=10)
    max_discount: Decimal | None = Field(None, ge=0, decimal_places=2, max_digits=10)

    applies_to: AppliesToAPI = AppliesToAPI.ALL
    restriction_type: RestrictionTypeAPI = RestrictionTypeAPI.ALL_ELIGIBLE

    min_order_amount: Decimal = Field(
        Decimal("0"), ge=0, decimal_places=2, max_digits=10
    )

    usage_limit: int | None = Field(None, ge=1)
    per_user_limit: int = Field(1, ge=1)

    is_active: bool = True

    @field_validator("code", mode="before")
    @classmethod
    def normalize_code(cls, v: str) -> str:
        return v.strip().upper() if v else v

    @field_validator("discount_value")
    @classmethod
    def validate_discount_value(cls, v: Decimal, info) -> Decimal:  # noqa: ANN001
        if v <= 0:
            raise ValueError("Discount value must be greater than 0")
        # Check if percentage discount exceeds 100%
        discount_type = info.data.get("discount_type")
        if discount_type == DiscountTypeAPI.PERCENTAGE and v > 100:
            raise ValueError("Percentage discount cannot exceed 100%")
        return v


class CouponCreate(CouponBase):
    """Schema for creating a new coupon."""

    starts_at: datetime | None = None
    expires_at: datetime | None = None
    usage_limit: int | None = Field(None, ge=1)
    per_user_limit: int = Field(1, ge=1)


class CouponUpdate(BaseModel):
    """Schema for updating an existing coupon."""

    code: str | None = Field(None, min_length=1, max_length=50)
    description: str | None = Field(None, max_length=1000)
    discount_type: DiscountTypeAPI | None = None
    discount_value: Decimal | None = Field(None, gt=0, decimal_places=2, max_digits=10)
    max_discount: Decimal | None = Field(None, ge=0, decimal_places=2, max_digits=10)
    applies_to: AppliesToAPI | None = None
    restriction_type: RestrictionTypeAPI | None = None
    min_order_amount: Decimal | None = Field(
        None, ge=0, decimal_places=2, max_digits=10
    )
    starts_at: datetime | None = None
    expires_at: datetime | None = None
    usage_limit: int | None = Field(None, ge=1)
    per_user_limit: int | None = Field(None, ge=1)
    is_active: bool | None = None

    @model_validator(mode="after")
    def validate_discount_value(self) -> CouponUpdate:
        if (
            self.discount_value is not None
            and self.discount_type == DiscountTypeAPI.PERCENTAGE
            and self.discount_value > 100
        ):
            raise ValueError("Percentage discount cannot exceed 100%")
        return self


class CouponRead(TimestampSchemaRead):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str
    description: str | None = None
    discount_type: str
    discount_value: Decimal
    max_discount: Decimal | None = None
    applies_to: str
    restriction_type: str
    min_order_amount: Decimal
    usage_limit: int | None = None
    usage_count: int
    per_user_limit: int
    is_active: bool
    starts_at: datetime | None = None
    expires_at: datetime | None = None

    # Related data (populated when needed)
    course_ids: list[uuid.UUID] = []
    painting_ids: list[uuid.UUID] = []


class CouponDetailRead(TimestampSchemaRead):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str
    description: str | None = None
    discount_type: str
    discount_value: Decimal
    max_discount: Decimal | None = None
    applies_to: str
    restriction_type: str
    min_order_amount: Decimal
    usage_limit: int | None = None
    usage_count: int
    per_user_limit: int
    is_active: bool
    starts_at: datetime | None = None
    expires_at: datetime | None = None

    # Related courses and paintings
    courses: list[CouponCourseRead] = []
    paintings: list[CouponPaintingRead] = []


class CouponCourseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    coupon_id: uuid.UUID
    course_id: uuid.UUID


class CouponPaintingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    coupon_id: uuid.UUID
    product_id: uuid.UUID


class CouponListRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str
    description: str | None = None
    discount_type: str
    discount_value: Decimal
    max_discount: Decimal | None = None
    applies_to: str
    restriction_type: str
    min_order_amount: Decimal
    usage_limit: int | None = None
    usage_count: int
    per_user_limit: int
    is_active: bool
    starts_at: datetime | None = None
    expires_at: datetime | None = None


class CouponUsageRead(TimestampSchemaRead):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    coupon_id: uuid.UUID
    user_id: uuid.UUID
    order_id: uuid.UUID | None = None
    course_payment_id: uuid.UUID | None = None
    discount_amount: Decimal
    used_at: datetime


# ─── Coupon Validation Request/Response ─────────────────────────────────────────


class CouponValidationItem(BaseModel):
    """An item in the cart for coupon validation."""

    type: str = Field(..., pattern="^(course|painting)$")
    id: uuid.UUID
    variant_id: uuid.UUID | None = None
    quantity: int = Field(1, ge=1)


class CouponValidateRequest(BaseModel):
    code: str
    items: list[CouponValidationItem] = Field(..., min_length=1)

    @field_validator("code", mode="before")
    @classmethod
    def normalize_code(cls, v: str) -> str:
        return v.strip().upper() if v else v


class EligibleItemResponse(BaseModel):
    type: str  # "course" or "painting"
    id: uuid.UUID
    variant_id: uuid.UUID | None = None
    title: str
    variant_name: str | None = None
    quantity: int
    unit_price: Decimal
    line_total: Decimal


class CouponValidateResponse(BaseModel):
    valid: bool
    code: str
    discount_type: str
    discount_value: Decimal
    max_discount: Decimal | None = None
    applies_to: str
    restriction_type: str
    min_order_amount: Decimal
    cart_subtotal: Decimal
    eligible_subtotal: Decimal
    discount_amount: Decimal
    gateway_fee: Decimal
    final_total: Decimal
    eligible_items: list[EligibleItemResponse] = []

    # Error info (when valid=False)
    error: str | None = None
    error_code: str | None = None


# ─── Admin Coupon Usage Response ────────────────────────────────────────────────


class AdminCouponUsageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    user_full_name: str | None = None
    user_email: str | None = None
    order_id: uuid.UUID | None = None
    course_payment_id: uuid.UUID | None = None
    discount_amount: Decimal
    used_at: datetime

    # Order info (if order)
    order_number: str | None = None
    # Course payment info (if course)
    course_title: str | None = None


# ─── Admin Coupon Schemas ───────────────────────────────────────────────────────


class AdminCouponCreate(BaseModel):
    """Schema for admin creating a coupon."""

    code: str = Field(..., min_length=1, max_length=50)
    description: str | None = Field(None, max_length=1000)

    discount_type: DiscountTypeAPI
    discount_value: Decimal = Field(..., gt=0, decimal_places=2, max_digits=10)
    max_discount: Decimal | None = Field(None, ge=0, decimal_places=2, max_digits=10)

    applies_to: AppliesToAPI = AppliesToAPI.ALL
    restriction_type: RestrictionTypeAPI = RestrictionTypeAPI.ALL_ELIGIBLE

    min_order_amount: Decimal = Field(
        Decimal("0"), ge=0, decimal_places=2, max_digits=10
    )

    usage_limit: int | None = Field(None, ge=1)
    per_user_limit: int = Field(1, ge=1)

    starts_at: datetime | None = None
    expires_at: datetime | None = None

    is_active: bool = True

    # For selected products
    course_ids: list[uuid.UUID] = Field(default_factory=list)
    painting_ids: list[uuid.UUID] = Field(default_factory=list)

    @field_validator("code", mode="before")
    @classmethod
    def normalize_code(cls, v: str) -> str:
        return v.strip().upper() if v else v

    @model_validator(mode="after")
    def validate_discount_pair(self) -> AdminCouponCreate:
        if (
            self.discount_type == DiscountTypeAPI.PERCENTAGE
            and self.discount_value > 100
        ):
            raise ValueError("Percentage discount cannot exceed 100%")
        if self.expires_at and self.starts_at and self.expires_at <= self.starts_at:
            raise ValueError("Expiry must be later than the start date")
        if self.applies_to == AppliesToAPI.SELECTED_COURSES and not self.course_ids:
            raise ValueError("Select at least one course")
        if self.applies_to == AppliesToAPI.SELECTED_PAINTINGS and not self.painting_ids:
            raise ValueError("Select at least one painting")
        if (
            self.restriction_type == RestrictionTypeAPI.SELECTED_PRODUCTS
            and self.applies_to == AppliesToAPI.ALL
            and not self.course_ids
            and not self.painting_ids
        ):
            raise ValueError("Select at least one course or painting")
        return self


class AdminCouponUpdate(BaseModel):
    description: str | None = Field(None, max_length=1000)
    discount_type: DiscountTypeAPI | None = None
    discount_value: Decimal | None = Field(None, gt=0, decimal_places=2, max_digits=10)
    max_discount: Decimal | None = Field(None, ge=0, decimal_places=2, max_digits=10)
    applies_to: AppliesToAPI | None = None
    restriction_type: RestrictionTypeAPI | None = None
    min_order_amount: Decimal | None = Field(
        None, ge=0, decimal_places=2, max_digits=10
    )
    usage_limit: int | None = Field(None, ge=1)
    per_user_limit: int | None = Field(None, ge=1)
    starts_at: datetime | None = None
    expires_at: datetime | None = None
    is_active: bool | None = None
    course_ids: list[uuid.UUID] | None = None
    painting_ids: list[uuid.UUID] | None = None

    @model_validator(mode="after")
    def validate_discount_value(self) -> AdminCouponUpdate:
        if (
            self.discount_value is not None
            and self.discount_type == DiscountTypeAPI.PERCENTAGE
            and self.discount_value > 100
        ):
            raise ValueError("Percentage discount cannot exceed 100%")
        return self


class AdminCouponRead(CouponRead):
    course_ids: list[uuid.UUID] = []
    painting_ids: list[uuid.UUID] = []


class AdminCouponListRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str
    description: str | None = None
    discount_type: str
    discount_value: Decimal
    max_discount: Decimal | None = None
    applies_to: str
    restriction_type: str
    min_order_amount: Decimal
    usage_limit: int | None = None
    usage_count: int
    per_user_limit: int
    is_active: bool
    starts_at: datetime | None = None
    expires_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class AdminCouponUsageListRead(BaseModel):
    coupon_code: str
    coupon_id: uuid.UUID
    total_usage: int
    total_discount_amount: Decimal = Decimal("0")
    usage_limit: int | None = None
    page: int = 1
    page_size: int = 20
    total_items: int = 0
    total_pages: int = 0
    usages: list[AdminCouponUsageRead] = []
