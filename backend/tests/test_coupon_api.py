from uuid import uuid4

import pytest

from app.models.course import Course
from app.models.product import Product, ProductStatus
from app.models.user import Role


@pytest.mark.asyncio
async def test_admin_coupon_create_update_list_detail_and_usage(
    test_client, authenticated_user, db_session
):
    authenticated_user["user"].role = Role.ADMIN
    await db_session.commit()
    headers = authenticated_user["headers"]
    payload = {
        "code": f"artist-{uuid4().hex[:8]}",
        "description": "Admin API integration coupon",
        "discount_type": "percentage",
        "discount_value": 15,
        "applies_to": "all",
        "restriction_type": "all_eligible",
        "min_order_amount": 0,
        "usage_limit": 25,
        "per_user_limit": 2,
        "is_active": True,
    }

    created = await test_client.post("/api/admin/coupons", json=payload, headers=headers)
    assert created.status_code == 200, created.text
    created_coupon = created.json()["data"]
    coupon_id = created_coupon["id"]
    assert created_coupon["code"] == payload["code"].upper()

    updated = await test_client.patch(
        f"/api/admin/coupons/{coupon_id}",
        json={"description": "Updated description", "discount_value": 20},
        headers=headers,
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["data"]["description"] == "Updated description"
    assert float(updated.json()["data"]["discount_value"]) == 20

    detail = await test_client.get(f"/api/admin/coupons/{coupon_id}", headers=headers)
    assert detail.status_code == 200, detail.text
    assert detail.json()["data"]["id"] == coupon_id

    listing = await test_client.get(
        f"/api/admin/coupons?page=1&page_size=20&search={payload['code'][:8]}",
        headers=headers,
    )
    assert listing.status_code == 200, listing.text
    assert any(
        item["id"] == coupon_id for item in listing.json()["data"]["data"]
    )

    usage = await test_client.get(
        f"/api/admin/coupons/{coupon_id}/usage", headers=headers
    )
    assert usage.status_code == 200, usage.text
    usage_data = usage.json()["data"]
    assert usage_data["total_items"] == 0
    assert float(usage_data["total_discount_amount"]) == 0
    assert usage_data["usages"] == []

    deactivated = await test_client.delete(
        f"/api/admin/coupons/{coupon_id}", headers=headers
    )
    assert deactivated.status_code == 200, deactivated.text
    inactive_detail = await test_client.get(
        f"/api/admin/coupons/{coupon_id}", headers=headers
    )
    assert inactive_detail.status_code == 200, inactive_detail.text
    assert inactive_detail.json()["data"]["is_active"] is False


@pytest.mark.asyncio
async def test_coupon_admin_api_rejects_non_admin(test_client, authenticated_user):
    response = await test_client.get(
        "/api/admin/coupons", headers=authenticated_user["headers"]
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_admin_coupon_validates_multiple_selected_item_ids(
    test_client, authenticated_user, db_session
):
    authenticated_user["user"].role = Role.ADMIN
    course = Course(
        title="Selected coupon course",
        slug=f"coupon-course-{uuid4().hex[:8]}",
        price=100,
        is_published=True,
    )
    painting = Product(
        title="Selected coupon painting",
        slug=f"coupon-painting-{uuid4().hex[:8]}",
        status=ProductStatus.PUBLISHED,
    )
    db_session.add_all([course, painting])
    await db_session.commit()

    payload = {
        "code": f"SELECTED-{uuid4().hex[:8]}",
        "discount_type": "percentage",
        "discount_value": 10,
        "applies_to": "all",
        "restriction_type": "selected_products",
        "min_order_amount": 0,
        "usage_limit": None,
        "per_user_limit": 1,
        "is_active": True,
        "course_ids": [str(course.id)],
        "painting_ids": [str(painting.id)],
    }

    created = await test_client.post(
        "/api/admin/coupons", json=payload, headers=authenticated_user["headers"]
    )
    assert created.status_code == 200, created.text
    coupon_id = created.json()["data"]["id"]
    assert created.json()["data"]["course_ids"] == [str(course.id)]
    assert created.json()["data"]["painting_ids"] == [str(painting.id)]

    invalid_update = await test_client.patch(
        f"/api/admin/coupons/{coupon_id}",
        json={"course_ids": [str(uuid4())]},
        headers=authenticated_user["headers"],
    )
    assert invalid_update.status_code == 422


@pytest.mark.asyncio
async def test_coupon_validation_route_is_mounted_at_api_coupons(
    test_client, authenticated_user
):
    response = await test_client.post(
        "/api/coupons/validate",
        json={"code": "NOT-A-REAL-COUPON", "items": []},
        headers=authenticated_user["headers"],
    )
    assert response.status_code != 404
