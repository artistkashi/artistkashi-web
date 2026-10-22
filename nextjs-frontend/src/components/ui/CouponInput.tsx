"use client";

import { useEffect, useRef, useState } from "react";
import { unwrap } from "@/api/client-service";
import { validateCoupon } from "@/api/openapi-client";
import { displayPrice } from "@/lib/utils";

async function validateCouponApi(code: string, items: Array<{ type: string; id: string; variant_id?: string; quantity: number }>) {
  return unwrap(validateCoupon({ body: { code, items } }));
}

interface CouponInputProps {
  cartItems: Array<{
    type: "course" | "painting";
    id: string;
    variant_id?: string;
    quantity: number;
  }>;
  subtotal: number;
  onCouponApplied: (result: {
    code: string;
    discount_amount: number;
    eligible_subtotal: number;
    gateway_fee: number;
    final_total: number;
    discount_type: string;
    discount_value: number;
    applies_to: string;
  }) => void;
  onCouponRemoved: () => void;
  appliedCoupon?: {
    code: string;
    discount_amount: number;
    discount_type: string;
    discount_value: number;
  } | null;
}

export function CouponInput({
  cartItems,
  subtotal,
  onCouponApplied,
  onCouponRemoved,
  appliedCoupon,
}: CouponInputProps) {
  const [code, setCode] = useState("");
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestInFlight = useRef(false);
  const cartSignature = JSON.stringify({ items: cartItems, subtotal });
  const previousCartSignature = useRef(cartSignature);

  useEffect(() => {
    if (previousCartSignature.current !== cartSignature) {
      previousCartSignature.current = cartSignature;
      if (appliedCoupon) {
        onCouponRemoved();
        setError("Cart changed. Apply the coupon again to recalculate the discount.");
      }
    }
  }, [cartSignature, appliedCoupon, onCouponRemoved]);

  const handleApply = async () => {
    if (!code.trim()) {
      setError("Please enter a coupon code");
      return;
    }

    // Prevent duplicate submissions
    if (requestInFlight.current) {
      return;
    }

    requestInFlight.current = true;
    setIsApplying(true);
    setError(null);

    try {
      const items = cartItems.map((item) => ({
        type: item.type,
        id: item.id,
        variant_id: item.variant_id,
        quantity: item.quantity,
      }));

      const result = await validateCouponApi(code, items);

      if (result.valid) {
        onCouponApplied({
          code: result.code,
          discount_amount: Number(result.discount_amount),
          eligible_subtotal: Number(result.eligible_subtotal),
          gateway_fee: Number(result.gateway_fee),
          final_total: Number(result.final_total),
          discount_type: result.discount_type,
          discount_value: Number(result.discount_value),
          applies_to: result.applies_to,
        });
        setCode("");
      } else {
        setError(result.error || "Invalid coupon");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to apply coupon";
      setError(message);
    } finally {
      setIsApplying(false);
      requestInFlight.current = false;
    }
  };

  const handleRemove = () => {
    onCouponRemoved();
    setCode("");
    setError(null);
  };

  if (appliedCoupon) {
    return (
      <div className="flex items-center justify-between p-4 bg-green-500/10 border border-green-500/30 rounded-sm">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-green-400 uppercase tracking-widest">
              {appliedCoupon.code}
            </span>
            <span className="text-sm text-green-400">
              {appliedCoupon.discount_type === "percentage"
                ? `${appliedCoupon.discount_value}% OFF`
                : `₹${appliedCoupon.discount_value} OFF`}
            </span>
          </div>
          <span className="text-sm font-bold text-green-400">
            -{displayPrice(appliedCoupon.discount_amount)}
          </span>
        </div>
        <button
          onClick={handleRemove}
          className="text-text-muted hover:text-red-400 transition-colors"
          aria-label="Remove coupon"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-text-muted hover:text-red-400 transition-colors" aria-label="Remove coupon">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex gap-2">
        <input
          type="text"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setError(null);
          }}
          placeholder="COUPON CODE"
          className="flex-1 h-10 px-4 bg-dark border rounded-sm transition-all placeholder:text-text-muted/40 text-text-main focus:outline-none focus:border-gold/50 border-border/60 text-text-main placeholder:text-text-muted/40"
          disabled={isApplying}
        />
        <button
          onClick={handleApply}
          disabled={isApplying || !code.trim()}
          className="shrink-0 px-6 py-3 bg-primary text-dark text-2xs font-bold uppercase tracking-[0.08em] rounded-sm hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isApplying ? "APPLYING..." : "APPLY"}
        </button>
      </div>
      {error && (
        <p className="mt-2 text-xs text-red-400 font-mono">{error}</p>
      )}
    </div>
  );
}

export default CouponInput;
