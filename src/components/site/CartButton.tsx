import { ShoppingCart } from "lucide-react";
import { useSyncExternalStore } from "react";

import { SiteLink } from "@/components/site/SiteLink";
import { cartCount, getCart, getServerCart, subscribeCart } from "@/lib/cart";
import { bookingPaths, t, type Lang } from "@/lib/site";

export function useCart() {
  return useSyncExternalStore(subscribeCart, getCart, getServerCart);
}

export function CartButton({ lang }: { lang: Lang }) {
  const cart = useCart();
  const count = cartCount(cart);

  return (
    <SiteLink
      to={bookingPaths(lang).cart}
      className="relative inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-foreground transition-colors hover:border-primary hover:text-primary"
      aria-label={t("cart", lang)}
    >
      <ShoppingCart className="h-4 w-4" />
      <span className="hidden sm:inline">{t("cart", lang)}</span>
      {count > 0 ? (
        <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground">
          {count}
        </span>
      ) : null}
    </SiteLink>
  );
}
