export type CartItem = {
  equipmentId: string;
  name: string;
  image: string;
  dailyPrice: number;
  quantity: number;
  pageType: "product" | "kit";
  slug: string;
};

export type Cart = {
  startsOn: string;
  endsOn: string;
  items: CartItem[];
};

const KEY = "avrental-cart-v1";
const EMPTY: Cart = { startsOn: "", endsOn: "", items: [] };

let cache: Cart = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function read(): Cart {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Cart;
    return {
      startsOn: typeof parsed.startsOn === "string" ? parsed.startsOn : "",
      endsOn: typeof parsed.endsOn === "string" ? parsed.endsOn : "",
      items: Array.isArray(parsed.items) ? parsed.items.filter((i) => i && i.equipmentId) : [],
    };
  } catch {
    return EMPTY;
  }
}

function write(next: Cart) {
  cache = next;
  loaded = true;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  }
  listeners.forEach((fn) => fn());
}

export function getCart(): Cart {
  if (!loaded) {
    cache = read();
    loaded = true;
  }
  return cache;
}

export function subscribeCart(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const getServerCart = (): Cart => EMPTY;

export function setCartDates(startsOn: string, endsOn: string) {
  write({ ...getCart(), startsOn, endsOn });
}

export function addToCart(item: CartItem, dates?: { startsOn: string; endsOn: string }) {
  const cart = getCart();
  const items = [...cart.items];
  const index = items.findIndex((i) => i.equipmentId === item.equipmentId);
  if (index >= 0) {
    items[index] = { ...items[index]!, quantity: items[index]!.quantity + item.quantity };
  } else {
    items.push(item);
  }
  write({
    startsOn: dates?.startsOn || cart.startsOn,
    endsOn: dates?.endsOn || cart.endsOn,
    items,
  });
}

export function setQuantity(equipmentId: string, quantity: number) {
  const cart = getCart();
  const items = cart.items
    .map((i) => (i.equipmentId === equipmentId ? { ...i, quantity } : i))
    .filter((i) => i.quantity > 0);
  write({ ...cart, items });
}

export function removeFromCart(equipmentId: string) {
  const cart = getCart();
  write({ ...cart, items: cart.items.filter((i) => i.equipmentId !== equipmentId) });
}

export function clearCart() {
  write(EMPTY);
}

export const cartCount = (cart: Cart) => cart.items.reduce((sum, i) => sum + i.quantity, 0);

export const rentalDays = (startsOn: string, endsOn: string) => {
  if (!startsOn || !endsOn) return 0;
  const start = new Date(startsOn).getTime();
  const end = new Date(endsOn).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;
  return Math.round((end - start) / 86_400_000) + 1;
};
