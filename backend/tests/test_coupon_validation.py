import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest

from app.models.coupon import DiscountType
from app.services.coupon_service import (
    CouponService,
    CouponValidationError,
    EligibleItem,
)


class DummyCoupon:
    def __init__(self, **kwargs):
        self.id = uuid.uuid4()
        self.code = kwargs.get("code", "TEST")
        self.is_active = kwargs.get("is_active", True)
        self.starts_at = kwargs.get("starts_at", None)
        self.expires_at = kwargs.get("expires_at", None)
        self.usage_limit = kwargs.get("usage_limit", None)
        self.usage_count = kwargs.get("usage_count", 0)
        self.per_user_limit = kwargs.get("per_user_limit", 1)
        self.min_order_amount = kwargs.get("min_order_amount", 0)
        self.discount_type = kwargs.get("discount_type", DiscountType.PERCENTAGE)
        self.discount_value = kwargs.get("discount_value", Decimal("10"))
        self.max_discount = kwargs.get("max_discount", None)


class DummySession:
    pass


@pytest.mark.asyncio
async def test_validate_coupon_expired():
    svc = CouponService()
    coupon = DummyCoupon(
        is_active=True,
        expires_at=datetime.now(UTC) - timedelta(days=1),
    )
    eligible = [
        EligibleItem(
            item_type="course",
            item_id=uuid.uuid4(),
            variant_id=None,
            title="C",
            variant_name="",
            quantity=1,
            unit_price=Decimal("100"),
        )
    ]
    with pytest.raises(CouponValidationError) as exc:
        await svc.validate_coupon(
            DummySession(), coupon, uuid.uuid4(), eligible, Decimal("100")
        )
    assert exc.value.code == "COUPON_EXPIRED"


@pytest.mark.asyncio
async def test_validate_coupon_not_yet_active():
    svc = CouponService()
    coupon = DummyCoupon(
        is_active=True,
        starts_at=datetime.now(UTC) + timedelta(days=1),
    )
    eligible = [
        EligibleItem(
            item_type="course",
            item_id=uuid.uuid4(),
            variant_id=None,
            title="C",
            variant_name="",
            quantity=1,
            unit_price=Decimal("100"),
        )
    ]
    with pytest.raises(CouponValidationError) as exc:
        await svc.validate_coupon(
            DummySession(), coupon, uuid.uuid4(), eligible, Decimal("100")
        )
    assert exc.value.code == "COUPON_NOT_YET_ACTIVE"


@pytest.mark.asyncio
async def test_validate_coupon_min_order_not_met():
    svc = CouponService()
    coupon = DummyCoupon(min_order_amount=Decimal("500"))
    eligible = [
        EligibleItem(
            item_type="course",
            item_id=uuid.uuid4(),
            variant_id=None,
            title="C",
            variant_name="",
            quantity=1,
            unit_price=Decimal("100"),
        )
    ]
    with pytest.raises(CouponValidationError) as exc:
        await svc.validate_coupon(
            DummySession(), coupon, uuid.uuid4(), eligible, Decimal("100")
        )
    assert exc.value.code == "COUPON_MIN_ORDER_NOT_MET"


@pytest.mark.asyncio
async def test_validate_coupon_no_eligible_items():
    svc = CouponService()
    coupon = DummyCoupon()
    with pytest.raises(CouponValidationError) as exc:
        await svc.validate_coupon(
            DummySession(), coupon, uuid.uuid4(), [], Decimal("0")
        )
    assert exc.value.code == "COUPON_NO_ELIGIBLE_ITEMS"


@pytest.mark.asyncio
async def test_validate_coupon_valid():
    svc = CouponService()
    coupon = DummyCoupon()
    eligible = [
        EligibleItem(
            item_type="course",
            item_id=uuid.uuid4(),
            variant_id=None,
            title="C",
            variant_name="",
            quantity=1,
            unit_price=Decimal("500"),
        )
    ]
    res = await svc.validate_coupon(
        DummySession(), coupon, uuid.uuid4(), eligible, Decimal("500")
    )
    assert res["valid"] is True


def test_calculate_discount_percentage_with_max():
    svc = CouponService()
    coupon = DummyCoupon(
        discount_type=DiscountType.PERCENTAGE,
        discount_value=Decimal("50"),
        max_discount=Decimal("100"),
    )
    d = svc.calculate_discount(coupon, Decimal("1000"))
    assert d == Decimal("100")


def test_calculate_discount_percentage_over_total():
    svc = CouponService()
    coupon = DummyCoupon(
        discount_type=DiscountType.PERCENTAGE,
        discount_value=Decimal("50"),
    )
    d = svc.calculate_discount(coupon, Decimal("100"))
    assert d == Decimal("50")
    # discount capped at subtotal later, but this function returns discount
    d2 = svc.calculate_discount(coupon, Decimal("50"))
    assert d2 == Decimal("25")


def test_calculate_discount_fixed():
    svc = CouponService()
    coupon = DummyCoupon(
        discount_type=DiscountType.FIXED,
        discount_value=Decimal("500"),
    )
    d = svc.calculate_discount(coupon, Decimal("1000"))
    assert d == Decimal("500")
    d = svc.calculate_discount(coupon, Decimal("300"))
    assert d == Decimal("300")  # capped to subtotal in application


def test_course_purchase_has_no_packaging_fee():
    svc = CouponService()
    total, gateway_fee, packaging_fee = svc.calculate_payable_amount(
        Decimal("500"), Decimal("100"), is_painting_order=False
    )
    assert packaging_fee == Decimal("0")
    assert gateway_fee == Decimal("14.16")
    assert total == Decimal("414.16")


def test_painting_purchase_keeps_packaging_fee():
    svc = CouponService()
    total, gateway_fee, packaging_fee = svc.calculate_payable_amount(
        Decimal("500"), Decimal("100"), is_painting_order=True
    )
    assert packaging_fee == Decimal("99")
    assert gateway_fee == Decimal("14.16")
    assert total == Decimal("513.16")
