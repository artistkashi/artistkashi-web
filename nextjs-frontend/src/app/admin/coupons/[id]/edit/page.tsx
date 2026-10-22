"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { toast } from "@/lib/toast";
import {
  getAdminCoupon,
  updateAdminCoupon,
  type AdminCouponRead,
  type AdminCouponUpdate,
} from "@/api/admin-coupons";
import { CouponForm, type CouponFormValues } from "@/components/admin/coupons/CouponForm";

async function updateCoupon(id: string, data: AdminCouponUpdate): Promise<AdminCouponRead> {
  return updateAdminCoupon(id, data);
}

export default function EditCouponPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const couponId = params.id as string;
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: coupon, isLoading } = useQuery({
    queryKey: ["admin-coupon", couponId],
    queryFn: () => getAdminCoupon(couponId),
    enabled: !!couponId,
  });

  const { mutate: updateCouponMutate } = useMutation({
    mutationFn: (data: AdminCouponUpdate) => updateCoupon(couponId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-coupons"] });
      queryClient.invalidateQueries({ queryKey: ["admin-coupon", couponId] });
      toast.success("Coupon updated successfully");
      router.push(`/admin/coupons/${couponId}`);
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: () => setIsSubmitting(false),
  });

  const handleFormSubmit = (data: CouponFormValues) => {
    const payload: AdminCouponUpdate = {
      description: data.description || null,
      discount_type: data.discount_type,
      discount_value: data.discount_value,
      max_discount: data.max_discount ?? null,
      applies_to: data.applies_to,
      restriction_type: data.restriction_type,
      min_order_amount: data.min_order_amount,
      usage_limit: data.usage_limit ?? null,
      per_user_limit: data.per_user_limit,
      starts_at: data.starts_at || null,
      expires_at: data.expires_at || null,
      is_active: data.is_active,
      course_ids: data.course_ids.length > 0 ? data.course_ids : undefined,
      painting_ids: data.painting_ids.length > 0 ? data.painting_ids : undefined,
    };
    setIsSubmitting(true);
    updateCouponMutate(payload);
  };

  if (isLoading || !coupon) {
    return (
      <div className="pt-8 pb-12 px-6 lg:px-12">
        <div className="max-w-3xl mx-auto text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="text-text-muted mt-4">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-8 pb-12 px-6 lg:px-12">
      <div className="max-w-3xl mx-auto space-y-6">
        <Link href={`/admin/coupons/${couponId}`} className="inline-flex items-center gap-2 text-text-muted hover:text-primary transition-colors">
          <ArrowLeft size={18} />
          Back to Details
        </Link>

        <div>
          <h1 className="text-3xl font-bold tracking-tight">Edit Coupon</h1>
          <p className="text-text-muted mt-1">Update coupon <span className="font-mono text-primary">{coupon.code}</span></p>
        </div>

        <CouponForm
          initialData={coupon}
          onSubmit={handleFormSubmit}
          isSubmitting={isSubmitting}
        />
      </div>
    </div>
  );
}
