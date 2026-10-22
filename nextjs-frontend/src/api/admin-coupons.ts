import { unwrap, unwrapPaginated, unwrapVoid } from "@/api/client-service";
import {
  createCoupon,
  deleteCoupon,
  getCoupon,
  getCouponUsage as getCouponUsageSdk,
  listCoupons,
  updateCoupon,
} from "@/api/openapi-client";
import type { Pagination } from "@/api/openapi-client/types.gen";

// Simplified list view - only essential fields for the table
export interface AdminCouponListRead {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  max_discount: number | null;
  applies_to: string;
  usage_limit: number | null;
  usage_count: number;
  is_active: boolean;
  starts_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

// Full detail view - includes all fields
export interface AdminCouponRead extends AdminCouponListRead {
  description: string | null;
  restriction_type: string;
  min_order_amount: number;
  per_user_limit: number;
  course_ids: string[];
  painting_ids: string[];
}

export interface AdminCouponCreate {
  code: string;
  description?: string | null;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  max_discount?: number | null;
  applies_to:
    | "all"
    | "courses"
    | "paintings"
    | "selected_courses"
    | "selected_paintings";
  restriction_type: "all_eligible" | "selected_products";
  min_order_amount: number;
  usage_limit?: number | null;
  per_user_limit: number;
  starts_at?: string | null;
  expires_at?: string | null;
  is_active: boolean;
  course_ids?: string[];
  painting_ids?: string[];
}

export interface AdminCouponUpdate {
  description?: string | null;
  discount_type?: "percentage" | "fixed";
  discount_value?: number;
  max_discount?: number | null;
  applies_to?:
    | "all"
    | "courses"
    | "paintings"
    | "selected_courses"
    | "selected_paintings";
  restriction_type?: "all_eligible" | "selected_products";
  min_order_amount?: number;
  usage_limit?: number | null;
  per_user_limit?: number;
  starts_at?: string | null;
  expires_at?: string | null;
  is_active?: boolean;
  course_ids?: string[] | null;
  painting_ids?: string[] | null;
}

export interface AdminCouponUsageRead {
  id: string;
  user_id: string;
  user_full_name: string | null;
  user_email: string | null;
  order_id: string | null;
  course_payment_id: string | null;
  discount_amount: number;
  used_at: string;
  order_number: string | null;
  course_title: string | null;
}

export interface AdminCouponUsageListRead {
  coupon_code: string;
  coupon_id: string;
  total_usage: number;
  total_discount_amount: number;
  usage_limit: number | null;
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
  usages: AdminCouponUsageRead[];
}

export async function listAdminCoupons(params: {
  page?: number;
  page_size?: number;
  search?: string;
  is_active?: boolean;
  applies_to?: string;
}): Promise<{ data: AdminCouponListRead[]; pagination: Pagination }> {
  const result = await unwrapPaginated(listCoupons({
    query: {
      page: params.page ?? 1,
      page_size: params.page_size ?? 20,
      search: params.search,
      is_active: params.is_active,
      applies_to: params.applies_to,
    },
  }));
  return result as unknown as { data: AdminCouponListRead[]; pagination: Pagination };
}

export async function getAdminCoupon(id: string): Promise<AdminCouponRead> {
  return (await unwrap(getCoupon({ path: { coupon_id: id } }))) as unknown as AdminCouponRead;
}

export async function createAdminCoupon(
  payload: AdminCouponCreate
): Promise<AdminCouponRead> {
  return (await unwrap(createCoupon({ body: payload }))) as unknown as AdminCouponRead;
}

export async function updateAdminCoupon(
  id: string,
  payload: AdminCouponUpdate
): Promise<AdminCouponRead> {
  return (await unwrap(updateCoupon({
    path: { coupon_id: id },
    body: payload,
  }))) as unknown as AdminCouponRead;
}

export async function deleteAdminCoupon(id: string): Promise<void> {
  return unwrapVoid(
    deleteCoupon({ path: { coupon_id: id } })
  );
}

export async function getCouponUsage(
  id: string,
  params: { page?: number; page_size?: number }
): Promise<AdminCouponUsageListRead> {
  return (await unwrap(getCouponUsageSdk({
    path: { coupon_id: id },
    query: { page: params.page ?? 1, page_size: params.page_size ?? 20 },
  }))) as unknown as AdminCouponUsageListRead;
}
