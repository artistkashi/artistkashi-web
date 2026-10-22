"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft, Edit, Trash2, Copy, ExternalLink, Calendar, Clock, Users, Tag } from "lucide-react";
import { GhostBtn } from "@/components/ui/buttons";
import { StatusModal } from "@/components/ui/StatusModal";
import { toast } from "@/lib/toast";
import { displayPrice } from "@/lib/utils";
import {
  getAdminCoupon,
  getCouponUsage,
  deleteAdminCoupon,
  type AdminCouponRead,
  type AdminCouponUsageListRead,
} from "@/api/admin-coupons";

async function fetchCoupon(id: string): Promise<AdminCouponRead> {
  return getAdminCoupon(id);
}

async function fetchCouponUsage(id: string, page: number): Promise<AdminCouponUsageListRead> {
  return getCouponUsage(id, { page, page_size: 20 });
}

async function deleteCoupon(id: string): Promise<void> {
  return deleteAdminCoupon(id);
}

async function copyToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

export default function CouponDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const couponId = params.id as string;
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [usagePage, setUsagePage] = useState(1);

  const { data: coupon, isLoading, error } = useQuery({
    queryKey: ["admin-coupon", couponId],
    queryFn: () => fetchCoupon(couponId),
    enabled: !!couponId,
  });

  const { data: usageData, isLoading: usageLoading, error: usageError, refetch: refetchUsage } = useQuery({
    queryKey: ["admin-coupon-usage", couponId, usagePage],
    queryFn: () => fetchCouponUsage(couponId, usagePage),
    enabled: !!couponId,
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteCoupon(couponId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-coupons"] });
      toast.success("Coupon deactivated");
      router.push("/admin/coupons");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  useEffect(() => {
    if (error && !isLoading) {
      router.push("/admin/coupons");
    }
  }, [error, isLoading, router]);

  if (isLoading || !coupon) {
    return (
      <div className="pt-8 pb-12 px-6 lg:px-12">
        <div className="max-w-3xl mx-auto text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="text-text-muted mt-4">Loading coupon details...</p>
        </div>
      </div>
    );
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getAppliesToLabel = (value: string) => {
    const labels: Record<string, string> = {
      all: "All Items",
      courses: "Courses Only",
      paintings: "Paintings Only",
      selected_courses: "Selected Courses",
      selected_paintings: "Selected Paintings",
    };
    return labels[value] || value;
  };

  const getRestrictionLabel = (value: string) => {
    const labels: Record<string, string> = {
      all_eligible: "All Eligible Items",
      selected_products: "Selected Products Only",
    };
    return labels[value] || value;
  };

  return (
    <div className="pt-8 pb-12 px-6 lg:px-12">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/admin/coupons" className="p-2 text-text-muted hover:text-primary transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              {coupon.code}
              {coupon.is_active ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20">
                  Active
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                  Inactive
                </span>
              )}
            </h1>
            <p className="text-text-muted mt-1">Created {formatDate(coupon.created_at)}</p>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <Link href={`/admin/coupons/${coupon.id}/edit`}>
              <GhostBtn>
                <Edit size={16} className="mr-2" />
                Edit
              </GhostBtn>
            </Link>
            <button
              onClick={() => copyToClipboard(coupon.code)}
              className="p-2 text-text-muted hover:text-primary transition-colors border border-border/60 rounded-sm"
              title="Copy code"
            >
              <Copy size={16} />
            </button>
            {!coupon.is_active ? null : (
              <button
                onClick={() => setDeleteConfirm(true)}
                className="p-2 text-text-muted hover:text-red-400 transition-colors border border-border/60 rounded-sm"
                title="Deactivate"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </div>

        <section aria-label="Coupon performance overview" className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-surface/30 border border-border/90 rounded-sm p-5">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-text-muted">
              <Tag size={14} /> Total Discount Granted
            </div>
            <p className="mt-3 text-2xl font-bold text-primary">
              {usageLoading || usageError ? "—" : displayPrice(usageData?.total_discount_amount ?? 0)}
            </p>
            <p className="mt-1 text-xs text-text-muted">Across recorded successful redemptions</p>
          </div>
          <div className="bg-surface/30 border border-border/90 rounded-sm p-5">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-text-muted">
              <Users size={14} /> Successful Redemptions
            </div>
            <p className="mt-3 text-2xl font-bold text-text-main">{usageData?.total_items ?? coupon.usage_count}</p>
            <p className="mt-1 text-xs text-text-muted">Lifetime redemption records</p>
          </div>
          <div className="bg-surface/30 border border-border/90 rounded-sm p-5">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-text-muted">
              <Clock size={14} /> Average Discount
            </div>
            <p className="mt-3 text-2xl font-bold text-text-main">
              {usageLoading || usageError ? "—" : displayPrice((usageData?.total_items ?? 0) > 0
                ? (usageData?.total_discount_amount ?? 0) / (usageData?.total_items ?? 1)
                : 0)}
            </p>
            <p className="mt-1 text-xs text-text-muted">Per successful redemption</p>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-surface/30 border border-border/90 rounded-sm overflow-hidden p-6">
              <h2 className="text-lg font-bold uppercase tracking-widest text-text-main mb-6">Discount Details</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <label className="text-2xs font-bold uppercase tracking-widest text-text-muted">Discount Value</label>
                  <p className="text-2xl font-bold text-primary">
                    {coupon.discount_type === "percentage"
                      ? `${coupon.discount_value}% OFF`
                      : `₹${displayPrice(coupon.discount_value)} OFF`}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-2xs font-bold uppercase tracking-widest text-text-muted">Max Discount Cap</label>
                  <p className="text-text-main font-medium">
                    {coupon.max_discount ? `₹${displayPrice(coupon.max_discount)}` : "No limit"}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-2xs font-bold uppercase tracking-widest text-text-muted">Applies To</label>
                  <p className="text-text-main font-medium capitalize">
                    {getAppliesToLabel(coupon.applies_to)}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-2xs font-bold uppercase tracking-widest text-text-muted">Restriction</label>
                  <p className="text-text-main font-medium">
                    {getRestrictionLabel(coupon.restriction_type)}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-2xs font-bold uppercase tracking-widest text-text-muted">Min Order Amount</label>
                  <p className="text-text-main font-medium">
                    {coupon.min_order_amount > 0 ? `₹${displayPrice(coupon.min_order_amount)}` : "No minimum"}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-2xs font-bold uppercase tracking-widest text-text-muted">Per User Limit</label>
                  <p className="text-text-main font-medium">{coupon.per_user_limit}</p>
                </div>
              </div>
            </div>

            {coupon.description && (
              <div className="bg-surface/30 border border-border/90 rounded-sm overflow-hidden p-6">
                <h2 className="text-lg font-bold uppercase tracking-widest text-text-main mb-4">Description</h2>
                <p className="text-text-muted whitespace-pre-line">{coupon.description}</p>
              </div>
            )}

            {(coupon.applies_to === "selected_courses" && coupon.course_ids.length > 0) || (coupon.applies_to === "selected_paintings" && coupon.painting_ids.length > 0) ? (
              <div className="bg-surface/30 border border-border/90 rounded-sm overflow-hidden p-6">
                <h2 className="text-lg font-bold uppercase tracking-widest text-text-main mb-4 flex items-center gap-2">
                  {coupon.applies_to === "selected_courses" ? "Selected Courses" : "Selected Paintings"}
                  <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs font-mono rounded">
                    {coupon.applies_to === "selected_courses" ? coupon.course_ids.length : coupon.painting_ids.length}
                  </span>
                </h2>
                <div className="flex flex-wrap gap-2">
                  {(coupon.applies_to === "selected_courses" ? coupon.course_ids : coupon.painting_ids).map((id) => (
                    <span key={id} className="px-3 py-1 bg-dark border border-border/60 rounded-sm text-xs font-mono text-text-muted">
                      {id.slice(0, 8)}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="bg-surface/30 border border-border/90 rounded-sm overflow-hidden p-6">
              <h2 className="text-lg font-bold uppercase tracking-widest text-text-main mb-4">Validity & Usage</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-2xs font-bold uppercase tracking-widest text-text-muted flex items-center gap-1.5">
                    <Calendar size={12} /> Valid From
                  </label>
                  <p className="text-text-main font-medium">{formatDate(coupon.starts_at)}</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-2xs font-bold uppercase tracking-widest text-text-muted flex items-center gap-1.5">
                    <Calendar size={12} /> Expires
                  </label>
                  <p className="text-text-main font-medium">{formatDate(coupon.expires_at)}</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-2xs font-bold uppercase tracking-widest text-text-muted flex items-center gap-1.5">
                    <Tag size={12} /> Total Usage
                  </label>
                  <p className="text-text-main font-medium flex items-center gap-2">
                    {coupon.usage_count} / {coupon.usage_limit ?? "Unlimited"}
                    {coupon.usage_limit && (
                      <div className="w-32 h-1.5 bg-border rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${Math.min((coupon.usage_count / coupon.usage_limit) * 100, 100)}%` }}
                        />
                      </div>
                    )}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-2xs font-bold uppercase tracking-widest text-text-muted flex items-center gap-1.5">
                    <Clock size={12} /> Last Updated
                  </label>
                  <p className="text-text-main font-medium">{formatDate(coupon.updated_at)}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-surface/30 border border-border/90 rounded-sm overflow-hidden p-6">
              <h2 className="text-lg font-bold uppercase tracking-widest text-text-main mb-4 flex items-center gap-2">
                Usage History
                <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs font-mono rounded">
                  {usageData?.total_items ?? 0}
                </span>
              </h2>

              {usageLoading ? (
                <p className="text-center text-sm text-text-muted py-8">Loading usage history…</p>
              ) : usageError ? (
                <div className="text-center py-8 space-y-3">
                  <p className="text-sm text-danger">Failed to load usage history.</p>
                  <GhostBtn onClick={() => refetchUsage()} className="text-xs">Retry</GhostBtn>
                </div>
              ) : usageData?.usages.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="w-12 h-12 mx-auto text-text-muted/40 mb-3" />
                  <p className="text-text-muted">No usage records yet</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {usageData?.usages.map((usage) => (
                    <div
                      key={usage.id}
                      className="p-4 bg-dark border border-border/60 rounded-sm space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Users className="w-5 h-5 text-text-muted/60" />
                          <div>
                            <p className="text-sm font-medium text-text-main">
                              {usage.user_full_name || usage.user_email || `User ${usage.user_id.slice(0, 8)}`}
                            </p>
                            <p className="text-xs text-text-muted font-mono">{usage.user_id}</p>
                          </div>
                        </div>
                        <span className="font-bold text-primary text-lg">
                          -₹{displayPrice(usage.discount_amount)}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-xs text-text-muted">
                        <span className="flex items-center gap-1.5">
                          <Clock size={12} />
                          {formatDate(usage.used_at)}
                        </span>
                        {usage.order_number && (
                          <span className="flex items-center gap-1.5">
                            <ExternalLink size={12} />
                            Order {usage.order_number}
                          </span>
                        )}
                        {usage.course_title && (
                          <span className="flex items-center gap-1.5">
                            <Tag size={12} />
                            {usage.course_title}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {usageData && usageData.total_pages > 1 && (
                <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-4 text-sm text-text-muted">
                  <span>Page {usageData.page} of {usageData.total_pages} ({usageData.total_items} redemptions)</span>
                  <div className="flex gap-2">
                    <GhostBtn onClick={() => setUsagePage((p) => Math.max(1, p - 1))} disabled={usagePage <= 1} className="text-xs">Previous</GhostBtn>
                    <GhostBtn onClick={() => setUsagePage((p) => Math.min(usageData.total_pages, p + 1))} disabled={usagePage >= usageData.total_pages} className="text-xs">Next</GhostBtn>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-surface/30 border border-border/90 rounded-sm overflow-hidden p-6">
              <h2 className="text-lg font-bold uppercase tracking-widest text-text-main mb-4">Quick Actions</h2>
              <div className="space-y-3">
                <button
                  onClick={() => copyToClipboard(coupon.code)}
                  className="w-full flex items-center justify-center gap-2 p-3 bg-dark border border-border/60 rounded-sm text-text-main hover:border-primary/40 hover:text-primary transition-colors"
                >
                  <Copy size={16} />
                  Copy Coupon Code
                </button>
                <Link
                  href={`/admin/coupons/${coupon.id}/edit`}
                  className="w-full flex items-center justify-center gap-2 p-3 bg-dark border border-border/60 rounded-sm text-text-main hover:border-primary/40 hover:text-primary transition-colors"
                >
                  <Edit size={16} />
                  Edit Coupon
                </Link>
              </div>
            </div>
          </div>
        </div>

        <StatusModal
          isOpen={deleteConfirm}
          onClose={() => setDeleteConfirm(false)}
          type="warning"
          title="Deactivate Coupon"
          message="Are you sure you want to deactivate this coupon? This action cannot be undone. Existing usages will be preserved."
          actionText="DEACTIVATE"
          onAction={() => deleteMutation.mutate()}
        />
      </div>
    </div>
  );
}
