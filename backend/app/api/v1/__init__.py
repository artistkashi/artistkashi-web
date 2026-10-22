from fastapi import APIRouter

from app.core.config import settings

from .addresses import router as addresses_router
from .admin import router as admin_router
from .auth import router as auth_router
from .cart import router as cart_router
from .coupons import router as coupons_router
from .course_categories import router as course_categories_router
from .course_payments import router as course_payments_router
from .course_reviews import router as course_reviews_router
from .courses import router as courses_router
from .enrollments import router as enrollments_router
from .health import router as health_router
from .orders import router as orders_router
from .product_reviews import router as product_reviews_rounter
from .products import router as products_router
from .progress import router as progress_router
from .site_config import router as site_config_router
from .status import router as status_router
from .users import router as users_router
from .wishlist import router as wishlist_router

router = APIRouter(prefix=settings.API_V1_PREFIX)

router.include_router(health_router)
router.include_router(admin_router)

router.include_router(auth_router)
router.include_router(users_router)
router.include_router(addresses_router)
router.include_router(course_categories_router)
router.include_router(progress_router)
router.include_router(courses_router)
router.include_router(course_payments_router)
router.include_router(course_reviews_router)
router.include_router(enrollments_router)
router.include_router(product_reviews_rounter)
router.include_router(site_config_router)
router.include_router(products_router)
router.include_router(orders_router)
router.include_router(cart_router)
router.include_router(wishlist_router)
router.include_router(status_router)
router.include_router(coupons_router)
