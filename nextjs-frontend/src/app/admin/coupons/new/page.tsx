"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ChevronLeft, ExternalLink, Check } from "lucide-react";
import { PrimaryBtn } from "@/components/ui/buttons";
import { getErrorMessage } from "@/lib/error-handler";
import { createAdminCoupon, type AdminCouponCreate } from "@/api/admin-coupons";
import { CouponForm, type CouponFormValues } from "@/components/admin/coupons/CouponForm";
import { toast } from "@/lib/toast";
import { AnimatePresence, motion } from "framer-motion";

export default function NewCouponPage() {
  const queryClient = useQueryClient();
  const [createdCoupon, setCreatedCoupon] = useState<{
    id: string;
    code: string;
  } | null>(null);

  const mutation = useMutation({
    mutationFn: (data: CouponFormValues) => {
      const payload: AdminCouponCreate = {
        code: data.code.trim().toUpperCase(),
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
      return createAdminCoupon(payload);
    },
    onSuccess: (coupon) => {
      queryClient.invalidateQueries({ queryKey: ["admin-coupons"] });
      setCreatedCoupon({ id: coupon.id, code: coupon.code });
      toast.success("Coupon created successfully");
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <>
      <div className="lg:h-[calc(100vh-164px)] flex flex-col space-y-6 lg:overflow-hidden pb-10 lg:pb-0">
        <div className="shrink-0 px-1 pt-4 lg:pt-0">
          <Link
            href="/admin/coupons"
            className="flex items-center gap-2 text-2xs font-mono uppercase tracking-[0.2em] text-text-muted hover:text-gold transition-colors"
          >
            <ChevronLeft size={14} /> Back to Coupons
          </Link>
        </div>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 shrink-0 px-1">
          <div>
            <h1 className="text-4xl font-black text-text-main tracking-tighter uppercase leading-none">
              New <span className="text-gold italic">Coupon</span>
            </h1>
            <p className="text-text-muted text-xs mt-3 uppercase font-mono tracking-[0.3em] flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-gold rounded-full animate-pulse" />
              Create a new promotional coupon
            </p>
          </div>
        </div>

        <div className="flex-1 lg:overflow-y-auto lg:custom-scrollbar px-1">
          <div className="border border-border/60 bg-surface/30 backdrop-blur-md rounded-sm p-6 md:p-8">
            <CouponForm
              onSubmit={(data) => mutation.mutate(data)}
              isSubmitting={mutation.isPending}
            />
          </div>
        </div>
      </div>

      <SuccessModal
        coupon={createdCoupon}
        onClose={() => setCreatedCoupon(null)}
      />
    </>
  );
}

function SuccessModal({
  coupon,
  onClose,
}: {
  coupon: { id: string; code: string } | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (coupon) {
      setShow(true);
      const timer = setTimeout(() => {
        setShow(false);
        setTimeout(() => router.push("/admin/coupons"), 300);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [coupon, router]);

  return (
    <AnimatePresence>
      {coupon && show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-xl"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 260 }}
            className="relative w-full max-w-sm bg-surface border border-border/60 rounded-sm shadow-2xl overflow-hidden"
          >
            <motion.div
              initial={{ scaleX: 1 }}
              animate={{ scaleX: 0 }}
              transition={{ duration: 2.5, ease: "linear" }}
              style={{ transformOrigin: "left" }}
              className="absolute top-0 left-0 right-0 h-0.5 bg-gold"
            />

            <div className="p-10 flex flex-col items-center text-center gap-6">
              <div className="relative">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{
                    type: "spring",
                    stiffness: 200,
                    damping: 15,
                    delay: 0.15,
                  }}
                  className="w-20 h-20 rounded-full bg-gold/10 border-2 border-gold/40 flex items-center justify-center"
                >
                  <motion.div
                    initial={{ scale: 0, rotate: -45 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 12, delay: 0.3 }}
                  >
                    <Check size={36} className="text-gold" strokeWidth={2.5} />
                  </motion.div>
                </motion.div>

                <motion.div
                  initial={{ scale: 1, opacity: 0.4 }}
                  animate={{ scale: 1.6, opacity: 0 }}
                  transition={{ duration: 1, delay: 0.5, repeat: Infinity }}
                  className="absolute inset-0 w-20 h-20 rounded-full border border-gold/30"
                />
              </div>

              <div className="space-y-2">
                <motion.h2
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="text-lg font-black text-foreground uppercase tracking-tight"
                >
                  Coupon Created
                  <br />
                  <span className="text-gold">Successfully</span>
                </motion.h2>
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="text-xs text-text-muted font-mono uppercase tracking-widest leading-relaxed"
                >
                  {coupon.code}
                </motion.p>
              </div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="flex flex-col w-full gap-3 pt-2"
              >
                <PrimaryBtn
                  onClick={() => {
                    setShow(false);
                    setTimeout(() => router.push("/admin/coupons"), 300);
                  }}
                  className="w-full justify-center py-3.5 text-xs tracking-[0.3em]"
                >
                  <ExternalLink size={14} /> VIEW ALL COUPONS
                </PrimaryBtn>
                <button
                  onClick={() => {
                    setShow(false);
                    setTimeout(() => router.push(`/admin/coupons/${coupon.id}`), 300);
                  }}
                  className="text-2xs font-mono uppercase tracking-[0.2em] text-text-muted hover:text-gold transition-colors"
                >
                  Edit This Coupon
                </button>
              </motion.div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
