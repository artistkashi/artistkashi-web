from decimal import Decimal

import pytest

from app.schemas.coupon import AdminCouponUpdate, CouponUpdate


def test_coupon_update_rejects_percentage_over_100():
    with pytest.raises(ValueError):
        CouponUpdate(discount_type="percentage", discount_value=Decimal("150"))


def test_coupon_update_accepts_percentage_under_100():
    c = CouponUpdate(discount_type="percentage", discount_value=Decimal("50"))
    assert c.discount_value == Decimal("50")


def test_admin_coupon_update_rejects_percentage_over_100():
    with pytest.raises(ValueError):
        AdminCouponUpdate(discount_type="percentage", discount_value=Decimal("101"))


def test_coupon_update_fixed_ok():
    c = CouponUpdate(discount_type="fixed", discount_value=Decimal("1000"))
    assert c.discount_value == Decimal("1000")


def test_coupon_update_partial_still_validates_when_both_provided():
    c = CouponUpdate(discount_type="percentage", discount_value=Decimal("100"))
    assert c.discount_value == Decimal("100")
