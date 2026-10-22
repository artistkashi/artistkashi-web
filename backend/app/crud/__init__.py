from app.crud.address import crud_address
from app.crud.auth_provider import crud_auth_provider
from app.crud.coupon import (
    crud_coupon,
    crud_coupon_course,
    crud_coupon_painting,
    crud_coupon_usage,
)
from app.crud.course import (
    crud_course,
    crud_course_category,
    crud_course_enrollment,
    crud_course_lesson,
    crud_course_section,
    crud_lesson_progress,
)
from app.crud.review import crud_review
from app.crud.site_config import crud_site_config
from app.crud.user import crud_user

__all__ = [
    "crud_user",
    "crud_address",
    "crud_auth_provider",
    "crud_site_config",
    "crud_review",
    "crud_course",
    "crud_course_category",
    "crud_course_section",
    "crud_course_lesson",
    "crud_course_enrollment",
    "crud_lesson_progress",
    "crud_coupon",
    "crud_coupon_course",
    "crud_coupon_painting",
    "crud_coupon_usage",
]
