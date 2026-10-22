import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface CheckoutItem {
  cart_item_id?: number;
  product_id: string;
  variant_id: string | null;
  course_id: string | null;
  quantity: number;
  price: number | string;
  // UI helpers
  title: string;
  variant_name?: string;
  image?: string;
}

interface CheckoutState {
  items: CheckoutItem[];
  setItems: (items: CheckoutItem[]) => void;
  updateItemQuantity: (index: number, quantity: number) => void;
  clearCheckout: () => void;
}

export const useCheckoutStore = create<CheckoutState>()(
  persist(
    (set) => ({
      items: [],
      setItems: (items) => set({ items }),
      updateItemQuantity: (index, quantity) =>
        set((state) => {
          const updated = [...state.items];
          updated[index] = { ...updated[index], quantity: Math.max(1, quantity) };
          return { items: updated };
        }),
      clearCheckout: () => set({ items: [] }),
    }),
    {
      name: "artistkashi-checkout",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
