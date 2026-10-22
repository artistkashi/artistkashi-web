from fastapi import APIRouter, Depends

from app.core.auth.dependencies import get_current_admin
from app.schemas.responses import SuccessResponse

from . import coupons as coupons_module
from . import course_categories as course_categories_module
from . import course_payments as course_payments_module
from . import courses as courses_module
from . import dashboard as dashboard_module
from . import enrollments as enrollments_module
from . import lessons as lessons_module
from . import media as media_module
from . import orders as orders_module
from . import reviews as reviews_module
from . import sections as sections_module
from . import site_config as site_config_module
from . import users as users_module
from .products import router as products_router

router = APIRouter(
    prefix="/admin", tags=["ADMIN"], dependencies=[Depends(get_current_admin)]
)


@router.get("/stats", response_model=SuccessResponse[dict[str, int]])
async def admin_stats():
    return SuccessResponse(
        message="Admin stats retrieved successfully",
        data={"users": 42, "courses": 7, "products": 13},
    )


router.include_router(site_config_module.router, prefix="/config")
router.include_router(media_module.router, prefix="/media")
router.include_router(users_module.router)
router.include_router(products_router)
router.include_router(course_categories_module.router)
router.include_router(courses_module.router)
router.include_router(coupons_module.router)
router.include_router(enrollments_module.router)
router.include_router(sections_module.router)
router.include_router(lessons_module.router)
router.include_router(dashboard_module.router)
router.include_router(orders_module.router)
router.include_router(course_payments_module.router)
router.include_router(reviews_module.router)
