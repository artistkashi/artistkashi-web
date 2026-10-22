"use client";

import { unwrap, unwrapPaginated } from "@/api/client-service";
import {
  createOrder,
  listAddresses,
  verifyPayment,
} from "@/api/openapi-client";
import type { AddressRead, OrderCreate } from "@/api/openapi-client";
import { CouponInput } from "@/components/ui/CouponInput";
import { GhostBtn, PrimaryBtn } from "@/components/ui/buttons";
import { useAuth } from "@/lib/auth-store";
import { useCartStore } from "@/lib/cart-store";
import { useCheckoutStore } from "@/lib/checkout-store";
import { displayPrice } from "@/lib/utils";
import { ArrowLeft, CreditCard, Loader2, MapPin, ShieldCheck } from "lucide-react";
import Script from "next/script";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "@/lib/toast";

type AppliedCoupon = {
  code: string;
  discount_amount: number;
  eligible_subtotal: number;
  gateway_fee: number;
  final_total: number;
  discount_type: string;
  discount_value: number;
  applies_to: string;
};

type RazorpayResult = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

type RazorpayInstance = {
  open: () => void;
  on: (event: string, callback: (response: { error?: { description?: string } }) => void) => void;
};

type RazorpayOptions = {
  key?: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill?: { name?: string; email?: string };
  theme?: { color: string };
  modal?: { ondismiss?: () => void };
  handler: (response: RazorpayResult) => Promise<void>;
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

export default function CheckoutPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { items: checkoutItems, clearCheckout } = useCheckoutStore();
  const cartItems = useCartStore((state) => state.items);
  const removeCartItem = useCartStore((state) => state.removeItem);
  const fetchCart = useCartStore((state) => state.fetchCart);

  const [addresses, setAddresses] = useState<AddressRead[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<number | "">("");
  const [addressLoading, setAddressLoading] = useState(true);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  const [razorpayReady, setRazorpayReady] = useState(false);

  const paintingItems = useMemo(
    () => checkoutItems.filter((item) => item.product_id && !item.course_id),
    [checkoutItems]
  );
  const subtotal = paintingItems.reduce(
    (sum, item) => sum + Number(item.price || 0) * item.quantity,
    0
  );
  const couponItems = useMemo(
    () =>
      paintingItems.map((item) => ({
        type: "painting" as const,
        id: item.product_id,
        variant_id: item.variant_id ?? undefined,
        quantity: item.quantity,
      })),
    [paintingItems]
  );
  const removeCoupon = useCallback(() => setAppliedCoupon(null), []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace(`/login?returnTo=${encodeURIComponent("/checkout")}`);
      return;
    }
    if (checkoutItems.length === 0) {
      router.replace("/shop");
    }
  }, [authLoading, checkoutItems.length, router, user]);

  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    setAddressLoading(true);
    setAddressError(null);
    unwrapPaginated(listAddresses({}))
      .then(({ data }) => {
        if (cancelled) return;
        setAddresses(data);
        const defaultAddress = data.find((address) => address.is_default) ?? data[0];
        if (defaultAddress) setSelectedAddressId(defaultAddress.id);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setAddressError(error instanceof Error ? error.message : "Could not load your addresses.");
        }
      })
      .finally(() => {
        if (!cancelled) setAddressLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, user]);

  useEffect(() => {
    if (typeof window !== "undefined" && window.Razorpay) setRazorpayReady(true);
  }, []);

  const handlePayment = async () => {
    if (isPaying) return;
    if (!selectedAddressId) {
      toast.error("Choose a shipping address before continuing.");
      return;
    }
    if (!razorpayReady || !window.Razorpay) {
      toast.error("Payment checkout is still loading. Please try again in a moment.");
      return;
    }
    if (!process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID) {
      toast.error("Payment is not configured. Please contact support.");
      return;
    }

    setIsPaying(true);
    try {
      const payload: OrderCreate & { coupon_code?: string } = {
        shipping_address_id: selectedAddressId,
        billing_address_id: selectedAddressId,
        payment_method: "razorpay",
        items: paintingItems.map((item) => ({
          product_id: item.product_id,
          variant_id: item.variant_id,
          quantity: item.quantity,
          // The backend re-reads and saves the authoritative variant price.
          price: Number(item.price || 0),
        })),
        ...(appliedCoupon ? { coupon_code: appliedCoupon.code } : {}),
      };
      const order = await unwrap(createOrder({ body: payload }));
      if (!order.razorpay_order_id) {
        throw new Error("Payment order was not created. Please try again.");
      }

      const razorpay = new window.Razorpay({
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount: Math.round(Number(order.total_amount) * 100),
        currency: "INR",
        name: "ArtistKashi",
        description: `${paintingItems.length} artwork${paintingItems.length === 1 ? "" : "s"}`,
        order_id: order.razorpay_order_id,
        prefill: { name: user?.full_name, email: user?.email },
        theme: { color: "#D4AF37" },
        modal: { ondismiss: () => setIsPaying(false) },
        handler: async (payment) => {
          try {
            await unwrap(
              verifyPayment({ path: { order_id: order.id }, body: payment })
            );
            clearCheckout();
            const checkoutCartIds = new Set(
              paintingItems.map((item) => item.cart_item_id).filter(Boolean)
            );
            const purchasedCartItems = cartItems.filter((item) =>
              checkoutCartIds.has(item.id)
            );
            try {
              await Promise.all(purchasedCartItems.map((item) => removeCartItem(item.id)));
            } catch {
              await fetchCart();
            }
            toast.success("Payment verified. Your artwork order is confirmed.");
            router.push(`/orders/${order.id}`);
          } catch (error) {
            setIsPaying(false);
            toast.error(
              error instanceof Error
                ? `${error.message} If payment was deducted, contact support before retrying.`
                : "Payment verification failed. If payment was deducted, contact support before retrying."
            );
          }
        },
      });
      razorpay.on("payment.failed", (response) => {
        setIsPaying(false);
        toast.error(response.error?.description || "Payment failed. You can try again.");
      });
      razorpay.open();
    } catch (error) {
      setIsPaying(false);
      toast.error(error instanceof Error ? error.message : "Could not start checkout.");
    }
  };

  const estimatedGatewayFee = appliedCoupon?.gateway_fee ?? subtotal * (3.54 / 100);
  const estimatedTotal = appliedCoupon?.final_total ?? subtotal + estimatedGatewayFee + 99;

  if (authLoading || !user || checkoutItems.length === 0) {
    return (
      <div className="pt-32 pb-24 px-6 min-h-screen text-center text-text-muted">
        <Loader2 className="mx-auto animate-spin" />
        <p className="mt-4">Loading checkout…</p>
      </div>
    );
  }

  if (!paintingItems.length) {
    return (
      <div className="pt-32 pb-24 px-6 min-h-screen">
        <div className="max-w-2xl mx-auto text-center space-y-5">
          <h1 className="text-3xl font-bold">Artwork checkout</h1>
          <p className="text-text-muted">Course purchases are completed from the course page. Add an artwork to checkout here.</p>
          <Link href="/shop" className="inline-flex items-center gap-2 px-6 py-3 bg-primary/10 border border-primary/30 text-primary text-xs font-mono tracking-widest uppercase hover:bg-primary/20 transition-colors rounded">
            Browse Artwork <ArrowLeft className="rotate-180" size={14} />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-28 pb-24 px-6 min-h-screen">
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        strategy="afterInteractive"
        onLoad={() => setRazorpayReady(true)}
        onError={() => toast.error("Could not load the payment checkout. Refresh and try again.")}
      />
      <div className="max-w-6xl mx-auto space-y-8">
        <Link href="/cart" className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-primary">
          <ArrowLeft size={16} /> Back to cart
        </Link>
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-primary">Secure checkout</p>
          <h1 className="mt-2 text-4xl font-bold">Complete your artwork order</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          <div className="lg:col-span-2 space-y-6">
            <section className="p-6 bg-surface border border-border rounded space-y-4">
              <h2 className="flex items-center gap-2 text-lg font-bold"><MapPin size={18} /> Shipping address</h2>
              {addressLoading ? (
                <p className="text-sm text-text-muted">Loading saved addresses…</p>
              ) : addressError ? (
                <div className="space-y-3">
                  <p className="text-sm text-danger">{addressError}</p>
                  <GhostBtn onClick={() => window.location.reload()}>Retry</GhostBtn>
                </div>
              ) : addresses.length === 0 ? (
                <div className="space-y-3 text-sm text-text-muted">
                  <p>You need a saved address to ship artwork.</p>
                  <Link className="text-primary underline" href="/dashboard">Add an address in your profile</Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {addresses.map((address) => (
                    <label key={address.id} className={`flex cursor-pointer gap-3 rounded border p-4 ${selectedAddressId === address.id ? "border-primary bg-primary/5" : "border-border/60"}`}>
                      <input type="radio" name="shipping-address" checked={selectedAddressId === address.id} onChange={() => setSelectedAddressId(address.id)} />
                      <span className="text-sm text-text-main">
                        <span className="block font-medium">{address.line1}{address.line2 ? `, ${address.line2}` : ""}</span>
                        <span className="block text-text-muted">{[address.city, address.state, address.postal_code, address.country].filter(Boolean).join(", ")}</span>
                        {address.phone && <span className="block text-text-muted">{address.phone}</span>}
                      </span>
                      {address.is_default && <span className="ml-auto text-xs text-primary">Default</span>}
                    </label>
                  ))}
                  <Link className="text-xs text-primary underline" href="/dashboard">Manage saved addresses</Link>
                </div>
              )}
            </section>

            <section className="p-6 bg-surface border border-border rounded space-y-4">
              <h2 className="text-lg font-bold">Your artwork</h2>
              {paintingItems.map((item, index) => (
                <div key={`${item.product_id}-${item.variant_id}-${index}`} className="flex items-center gap-4 border-b border-border/60 pb-4 last:border-0 last:pb-0">
                  {item.image && <img src={item.image} alt={item.title} className="h-20 w-16 object-cover bg-dark" />}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-text-main">{item.title}</p>
                    {item.variant_name && <p className="text-xs text-text-muted">{item.variant_name}</p>}
                    <p className="text-xs text-text-muted">Quantity: {item.quantity}</p>
                  </div>
                  <p className="font-medium">{displayPrice(Number(item.price || 0) * item.quantity)}</p>
                </div>
              ))}
            </section>

            <section className="p-6 bg-surface border border-border rounded space-y-4">
              <h2 className="text-lg font-bold">Have a coupon?</h2>
              <CouponInput
                cartItems={couponItems}
                subtotal={subtotal}
                appliedCoupon={appliedCoupon}
                onCouponApplied={setAppliedCoupon}
                onCouponRemoved={removeCoupon}
              />
            </section>
          </div>

          <aside className="p-6 bg-surface border border-border rounded space-y-4">
            <h2 className="text-sm font-mono uppercase tracking-widest text-text-muted">Order summary</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-text-muted">Items subtotal</span><span>{displayPrice(subtotal)}</span></div>
              {appliedCoupon && <div className="flex justify-between text-green-400"><span>Coupon ({appliedCoupon.code})</span><span>-{displayPrice(appliedCoupon.discount_amount)}</span></div>}
              <div className="flex justify-between"><span className="text-text-muted">Payment gateway fee (estimated)</span><span>{displayPrice(estimatedGatewayFee)}</span></div>
              <div className="flex justify-between"><span className="text-text-muted">Packing and shipping</span><span>{displayPrice(99)}</span></div>
            </div>
            <div className="border-t border-border pt-4 flex justify-between font-bold">
              <span>Total (estimated)</span><span className="text-primary">{displayPrice(estimatedTotal)}</span>
            </div>
            <p className="text-xs text-text-muted">The final payable amount is recalculated by the server before payment.</p>
            <PrimaryBtn onClick={handlePayment} disabled={isPaying || addressLoading || addresses.length === 0 || !!addressError} className="w-full">
              {isPaying ? <><Loader2 size={16} className="mr-2 animate-spin" /> Processing…</> : <><CreditCard size={16} className="mr-2" /> Pay securely</>}
            </PrimaryBtn>
            <p className="flex items-center justify-center gap-1.5 text-xs text-text-muted"><ShieldCheck size={14} /> Payment verified securely by Razorpay</p>
          </aside>
        </div>
      </div>
    </div>
  );
}
