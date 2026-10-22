"use client";

import type { CartItemRead } from "@/api/openapi-client";
import { useAuth } from "@/lib/auth-store";
import { useCartStore } from "@/lib/cart-store";
import { useCheckoutStore } from "@/lib/checkout-store";
import { displayPrice } from "@/lib/utils";
import {
  ArrowRight,
  Loader2,
  Minus,
  Plus,
  ShoppingBag,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "@/lib/toast";

export default function CartPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { items, loaded, fetchCart, removeItem, updateQuantity } =
    useCartStore();
  const setCheckoutItems = useCheckoutStore((s) => s.setItems);
  const [processingId, setProcessingId] = useState<number | null>(null);

  useEffect(() => {
    if (!loaded) fetchCart();
  }, [loaded, fetchCart]);

  const total = items.reduce((sum, i) => {
    const price = i.variant?.price
      ? Number(i.variant.price)
      : i.product?.price
      ? Number(i.product.price)
      : i.course?.price
        ? Number(i.course.price)
        : 0;
    return sum + price * (i.quantity ?? 1);
  }, 0);

  const handleRemove = async (item: CartItemRead) => {
    setProcessingId(item.id);
    try {
      await removeItem(item.id);
      toast.success("Removed from cart");
    } catch {
      toast.error("Failed to remove item");
    } finally {
      setProcessingId(null);
    }
  };

  const handleQuantity = async (item: CartItemRead, delta: number) => {
    const newQty = (item.quantity ?? 1) + delta;
    if (newQty < 1) return;
    setProcessingId(item.id);
    try {
      await updateQuantity(item.id, newQty);
    } catch {
      toast.error("Failed to update quantity");
    } finally {
      setProcessingId(null);
    }
  };

  const handleCheckout = () => {
    const checkoutItems = items.filter((i) => i.product_id).map((i) => ({
      cart_item_id: i.id,
      product_id: i.product_id ?? "",
      variant_id: i.variant_id ?? null,
      course_id: i.course_id ?? null,
      quantity: i.quantity ?? 1,
      price: i.variant?.price
        ? Number(i.variant.price)
        : i.product?.price
        ? Number(i.product.price)
        : i.course?.price
          ? Number(i.course.price)
          : 0,
      title: i.product?.title ?? i.course?.title ?? "Artwork",
      image:
        i.product?.primary_image ??
        i.course?.computed_thumbnail_url ??
        undefined,
    }));
    setCheckoutItems(checkoutItems);
    router.push("/checkout");
  };

  if (!user) {
    return (
      <div className="pt-32 pb-24 px-6 min-h-screen">
        <div className="max-w-480 mx-auto px-6 md:px-12 lg:px-24 text-center py-20">
          <ShoppingBag size={48} className="mx-auto text-text-muted/30 mb-6" />
          <h1 className="text-4xl font-bold text-text-main mb-4">
            Your Collection
          </h1>
          <p className="text-text-muted mb-8">
            Sign in to view and manage your cart.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary/10 border border-primary/30 text-primary text-xs font-mono tracking-widest uppercase hover:bg-primary/20 transition-colors rounded"
          >
            Sign In <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-32 pb-24 px-6 min-h-screen">
      <div className="max-w-480 mx-auto px-6 md:px-12 lg:px-24">
        <h1 className="text-4xl md:text-5xl italic uppercase tracking-tighter mb-12">
          Your Collection
        </h1>

        {!loaded ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-text-muted" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-20">
            <ShoppingBag
              size={48}
              className="mx-auto text-text-muted/30 mb-6"
            />
            <p className="text-text-muted text-sm mb-8">
              Your collection is empty. Explore the gallery and academy.
            </p>
            <div className="flex items-center justify-center gap-4">
              <Link
                href="/shop"
                className="inline-flex items-center gap-2 px-6 py-3 border border-primary/30 text-primary text-xs font-mono tracking-widest uppercase hover:bg-primary/10 transition-colors rounded"
              >
                Browse Artworks <ArrowRight size={14} />
              </Link>
              <Link
                href="/courses"
                className="inline-flex items-center gap-2 px-6 py-3 border border-border/60 text-text-muted text-xs font-mono tracking-widest uppercase hover:text-text-main transition-colors rounded"
              >
                Explore Courses <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-16">
            <div className="lg:w-2/3 space-y-px ">
              {items.map((item) => {
                const isProduct = !!item.product;
                const price = isProduct
                  ? item.variant?.price
                    ? Number(item.variant.price)
                    : item.product?.price
                    ? Number(item.product.price)
                    : 0
                  : item.course?.price
                    ? Number(item.course.price)
                    : 0;
                const itemTotal = price * (item.quantity ?? 1);
                const image = isProduct
                  ? item.product?.primary_image
                  : item.course?.computed_thumbnail_url;
                const title = isProduct
                  ? (item.product?.title ?? "Unknown Artwork")
                  : (item.course?.title ?? "Unknown Course");
                const subtitle = isProduct
                  ? item.product?.medium?.name || "Original Work"
                  : item.course?.level || "Course";
                const href = isProduct
                  ? `/shop/${item.product?.slug}`
                  : `/courses/${item.course?.slug}`;

                return (
                  <div
                    key={item.id}
                    className="bg-surface p-6 flex gap-6 items-center rounded"
                  >
                    <div className="w-20 h-24 shrink-0 overflow-hidden bg-muted-light/50">
                      {image ? (
                        <img
                          src={image}
                          alt={title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-text-muted/20 text-2xs font-mono uppercase">
                          No Image
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <Link
                        href={href}
                        className="text-text-main font-semibold text-sm hover:text-primary transition-colors line-clamp-1"
                      >
                        {title}
                      </Link>
                      <div className="text-text-muted text-2xs font-mono mt-0.5">
                        {subtitle}
                      </div>
                      {isProduct && item.variant && (
                        <div className="text-text-muted text-2xs font-mono mt-0.5">
                          {item.variant.variant_type_name}: {item.variant.dimensions}
                        </div>
                      )}
                      <div className="flex items-center gap-4 mt-3">
                        <div className="flex items-center border border-border/60 rounded-sm">
                          <button
                            onClick={() => handleQuantity(item, -1)}
                            disabled={
                              processingId === item.id ||
                              (item.quantity ?? 1) <= 1
                            }
                            className="w-8 h-8 flex items-center justify-center text-text-muted hover:text-text-main hover:bg-muted/50 transition-colors disabled:opacity-30"
                          >
                            <Minus size={12} />
                          </button>
                          <span className="w-10 text-center text-xs font-mono text-text-main">
                            {item.quantity ?? 1}
                          </span>
                          <button
                            onClick={() => handleQuantity(item, 1)}
                            disabled={processingId === item.id}
                            className="w-8 h-8 flex items-center justify-center text-text-muted hover:text-text-main hover:bg-muted/50 transition-colors disabled:opacity-30"
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-text-main font-semibold text-sm">
                        {displayPrice(itemTotal)}
                      </div>
                      {item.quantity && item.quantity > 1 && (
                        <div className="text-text-muted text-2xs font-mono mt-0.5">
                          {displayPrice(price)} each
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => handleRemove(item)}
                      disabled={processingId === item.id}
                      className="text-text-muted hover:text-danger transition-colors disabled:opacity-50"
                    >
                      {processingId === item.id ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Trash2 size={16} />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="lg:w-1/3">
              <div className="border border-border bg-surface p-6 space-y-4 rounded">
                <h3 className="text-xs font-mono text-text-muted uppercase tracking-widest">
                  Order Summary
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-text-muted">
                    <span>Subtotal</span>
                    <span className="text-text-main">
                      {displayPrice(total)}
                    </span>
                  </div>
                  <div className="flex justify-between text-text-muted">
                    <span>Shipping</span>
                    <span className="text-text-main">
                      Calculated at next step
                    </span>
                  </div>
                </div>
                <div className="pt-4 border-t border-border">
                  <div className="flex justify-between text-base font-bold">
                    <span className="text-text-main">Total</span>
                    <span className="text-primary">{displayPrice(total)}</span>
                  </div>
                </div>
                <button
                  onClick={handleCheckout}
                  disabled={!items.some((item) => item.product_id)}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary/10 border border-primary/30 text-primary text-xs font-mono tracking-widest uppercase hover:bg-primary/20 transition-colors rounded disabled:opacity-50 mt-4"
                >
                  Proceed to Billing <ArrowRight size={14} />
                </button>
                {!items.some((item) => item.product_id) && items.some((item) => item.course_id) && (
                  <p className="text-xs text-text-muted text-center">
                    Course purchases are completed from each course page.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
