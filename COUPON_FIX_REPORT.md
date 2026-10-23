# Coupon Fix Report

## Readiness

**Incomplete.** The course packaging-fee defect and several backend integrity issues are fixed, and `/checkout` now supports painting orders with coupon application, saved shipping addresses, Razorpay order creation, and payment verification. Docker-backed API and migration checks pass locally, but staged end-to-end payment verification is still required before release.

## Verified findings and changes

- Course-only coupon totals were adding the shared packaging fee. Packaging is now added only when a painting item is in the validated cart. Course checkout stores the course coupon and its pricing fields, and course-only purchases do not add packaging fees.
- Painting order totals had an uninitialized running total and could add the packaging fee twice. Totals now use backend variant prices, add packaging once, and persist authoritative order item prices. Course items are rejected from the painting order endpoint because course enrollment and payment are handled by the LMS payment flow.
- Payment verification previously committed an order before coupon consumption and swallowed consumption errors. Coupon usage now shares the payment transaction, and order/course payment rows are locked during verification so repeated callbacks serialize.
- Coupon redemption already used a coupon row lock and rechecked global/per-user limits. Added partial unique indexes so one order or course payment cannot have multiple usage records. The migration checks for duplicates before adding indexes and fails without deleting existing records.
- Coupon redemption uses FastCRUD for the usage-count update and history insert. The only direct SQL statement in the coupon CRUD path is the `SELECT FOR UPDATE` row lock, which FastCRUD does not expose; it is encapsulated in `CRUDCoupon.lock_for_redemption`.
- Admin coupon detail now includes lifetime discounts granted and average discount per successful redemption, calculated from saved usage-history records.
- Painting checkout uses server-created Razorpay orders and server-side payment verification. The page requires a saved shipping address; the order service checks address ownership and rejects callbacks whose Razorpay order ID does not match the saved order.
- Selected-product restrictions were not applied consistently in coupon recalculation, and a painting variant could be paired with a different product ID. Eligibility checks now enforce the restriction and variant/product match.
- Admin coupon creation/update now validates discount pairs, date ranges, and selected-product relationships; relation writes no longer commit independently. Usage history now loads the user and course title in batch and returns pagination metadata. The admin list resets pagination when filters/search change and exposes list errors with retry.
- Selected course and painting IDs are queried through FastCRUD's `id__in` operator; FastCRUD mapping results are read by key when reporting invalid IDs. A regression test covers multiple selected IDs and a missing course ID.
- Coupon input clears an applied coupon when its cart signature changes. The course purchase screen displays the backend-calculated payable total.
- Docker-backed API testing exposed and fixed coupon insert timestamps missing against the migration's NOT NULL columns, admin list/get code treating FastCRUD dictionaries as ORM rows, unsupported coupon search filtering, malformed pagination response construction, and usage-history eager loading applied to a non-ORM select.
- The frontend coupon request now calls `/api/coupons/validate`, matching the mounted API route.

## Files changed

- `backend/app/services/order_service.py` — authoritative painting prices, corrected fee math, serialized verification, atomic coupon redemption.
- `backend/app/services/course_payment_service.py` and `backend/app/schemas/course_payment.py` — persist course coupon pricing, remove course packaging, serialize verification, idempotent repeated success response.
- `backend/app/services/coupon_service.py` — course-vs-painting packaging, selected-product eligibility, remove redundant item repricing pass.
- `backend/app/models/coupon.py`, `backend/app/crud/coupon.py`, `backend/app/api/v1/admin/coupons.py`, `backend/app/schemas/coupon.py` — usage uniqueness, atomic admin relation writes, validation and usage details.
- `backend/tests/test_coupon_api.py` — admin create/update/list/detail/deactivate/usage, authorization, and customer validation route integration coverage.
- `backend/alembic_migrations/versions/coupon_usage_idempotency.py` — guarded uniqueness indexes for redemption references.
- `backend/tests/test_coupon_validation.py` — course and painting packaging-fee cases.
- `backend/tests/test_order_checkout_security.py` — required and user-owned shipping address checks and Razorpay order ID mismatch rejection.
- `nextjs-frontend/src/components/ui/CouponInput.tsx`, `nextjs-frontend/src/app/courses/[slug]/page.tsx` — cart synchronization and course payable total.
- `nextjs-frontend/src/app/checkout/page.tsx`, `nextjs-frontend/src/app/cart/page.tsx`, `nextjs-frontend/src/lib/checkout-store.ts` — painting checkout, coupon application, shipping selection, payment verification, and variant pricing.
- `nextjs-frontend/src/api/admin-coupons.ts`, `nextjs-frontend/src/app/admin/coupons/page.tsx`, `nextjs-frontend/src/app/admin/coupons/[id]/page.tsx` — usage pagination, list reliability, and coupon performance overview.
- `nextjs-frontend/src/api/admin-courses-products.ts`, `nextjs-frontend/src/api/client-service.ts`, `nextjs-frontend/src/components/ui/CouponInput.tsx`, and coupon create/edit pages — generated SDK requests and shared response unwrapping for coupon and selector calls; support nested paginated envelopes.

## Checks run

- Backend coupon tests: `backend/.venv/Scripts/python.exe -m pytest tests/test_coupon_schemas.py tests/test_coupon_validation.py tests/test_coupon_consume.py -q` — **23 passed**, 1 unrelated Pydantic deprecation warning.
- Latest focused backend run against the Docker `db_test` PostgreSQL service: `backend/.venv/Scripts/python.exe -m pytest tests/test_order_checkout_security.py tests/test_coupon_consume.py tests/test_coupon_schemas.py tests/test_coupon_validation.py tests/test_coupon_api.py -q` — **29 passed**, 3 deprecation warnings.
- Alembic upgrade to head, downgrade of the coupon uniqueness migrations, and re-upgrade to head — passed against the isolated Docker `db_test` database on port 5433. No production database was touched.
- Backend syntax: `backend/.venv/Scripts/python.exe -m compileall -q app alembic_migrations/versions tests` — passed.
- Frontend type check: `pnpm type-check` — passed.
- Targeted frontend lint: `pnpm exec eslint ...` for the changed coupon and course pages — passed after removing unused imports.
- Frontend production build: `pnpm build` — passed after adding painting checkout. `/checkout` and coupon admin routes compiled successfully.
- Backend lint: `backend/.venv/Scripts/ruff.exe check ...` on the edited backend coupon/payment files — passed.
- Frontend tests: `pnpm test -- --runInBand` — could not run because Jest is not installed/available in the frontend dependencies.
- Full backend suite against Docker `db_test`: latest run **47 passed, 10 failed, 2 errors**. Failures are in OpenAPI schema expectations, existing password/registration behavior, and session endpoints; the errors are email fixture patch-path mismatches. The focused coupon/checkout suite passed again afterward. No clean baseline run established whether unrelated failures predate this work.
- `git diff --check` — passed, with line-ending warnings on pre-existing modified frontend files.
- Frontend type checking and build pass; the latest endpoint URL patch is covered by frontend type checking. No real Razorpay request or staging purchase was run.

### Docker and frontend API-client follow-up

- Started the complete configured Compose stack with `docker-compose up -d --build`. Backend, PostgreSQL, Redis, Mailpit, and MinIO reported running; `/docs` returned HTTP 200. Backend startup applied the pending coupon migrations to the local Compose database. No frontend service is enabled in `docker-compose.yml`.
- Coupon validation, coupon administration, and course/painting selector calls now use generated OpenAPI client methods with the shared `unwrap`/`unwrapPaginated` helpers. Pagination unwrapping supports both direct responses and the coupon list's nested success/pagination envelope.
- `pnpm type-check` — passed after the API-client refactor.
- Targeted ESLint for coupon APIs, selector APIs, coupon input, and coupon create/edit pages — passed after the refactor.
- `pnpm build` — passed after the refactor; coupon admin pages and checkout compiled.

### Selected item ID query regression

- Fixed coupon creation and update validation passing an ID list to FastCRUD's scalar `id` filter, which caused PostgreSQL/asyncpg to raise `DataError` and return HTTP 500. Both paths now use `id__in`.
- Pure coupon tests after the fix: **23 passed**; targeted Ruff and Python compile checks passed.
- The added PostgreSQL-backed admin regression test could not be executed in this follow-up because Docker Desktop's engine was unavailable (`docker-compose` could not connect to `dockerDesktopLinuxEngine`). Re-run `tests/test_coupon_api.py` after starting Docker Desktop.

## Remaining issues and risks

- Painting checkout is implemented but has not been run end to end against PostgreSQL and Razorpay test mode. Confirm payment failure, user cancellation, retries, saved order totals, and one-time coupon consumption in staging.
- The coupon API and Alembic checks use an isolated local Docker PostgreSQL database. Real Razorpay callback behavior and the complete browser purchase flows still need staging verification.
- A payment can succeed at Razorpay while the last available coupon redemption is won by another concurrent payment. The current transaction then rolls back local confirmation when consumption refuses the over-limit redemption. A reservation or payment reconciliation process is needed to handle that edge without charging a customer and leaving the local purchase pending.
- Frontend Jest coverage is unavailable until the test runner is installed/configured.

## Migration and deployment

Review existing `coupon_usages` for duplicate non-null `order_id` or `course_payment_id` values first. The new migration aborts and reports duplicates instead of deleting or merging them. Upgrade, downgrade, and re-upgrade were exercised on the isolated local test database.

From `backend/`, after backup and staging review:

```powershell
.venv\Scripts\alembic.exe upgrade head
```

Do not run this migration against production until the duplicate check and staging verification are complete. No production migration was run during this work.

## Manual staging verification

1. Create an active percentage coupon and a fixed coupon in the admin area; verify invalid percentages, dates, and selected IDs are rejected.
2. Apply a coupon to an eligible course. Confirm checkout shows the server total with **no packaging fee**, then pay using Razorpay test mode and verify one enrollment and one usage row.
3. Repeat the course verification callback; confirm enrollment and usage remain single.
4. Apply a coupon to eligible painting variants; confirm item totals, ₹99 packaging, discount, gateway fee, Razorpay amount, and saved order agree.
5. Test failed signatures, expired/invalid coupons, selected-item mismatch, exhausted global/per-user limits, repeated callbacks, and simultaneous redemptions.
6. Confirm admin coupon detail lists redemption user, purchase/course, discount, timestamp, and working pagination; confirm filters and search work from later pages.
