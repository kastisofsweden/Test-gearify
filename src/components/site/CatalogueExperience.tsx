import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Search, SlidersHorizontal, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/components/site/CartButton";
import { SiteLink } from "@/components/site/SiteLink";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { addDaysISO, todayISO } from "@/lib/booking";
import { addToCart, rentalDays, setCartDates } from "@/lib/cart";
import { catalogueImage } from "@/lib/catalogue-images";
import { byType, contentOf, imageOf, priceFromOf, type Lang, type SitePage } from "@/lib/site";

const fmt = (n: number) => new Intl.NumberFormat("sv-SE").format(n);
const catName = (item: SitePage, lang: Lang) =>
  contentOf(item, lang).h1.replace(/ för uthyrning$/, "");

export function CatalogueExperience({ page, lang }: { page: SitePage; lang: Lang }) {
  const sv = lang === "sv";
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(
    page.type === "kits" ? "kits" : page.type === "category" ? page.slug : "all",
  );
  const [maxPrice, setMaxPrice] = useState(5000);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sort, setSort] = useState("popular");
  const { data: bookables = [] } = useQuery({
    queryKey: ["catalogue-bookables"],
    queryFn: async () => {
      const { data } = await supabase
        .from("equipment")
        .select("id, page_type, page_slug, daily_price")
        .eq("is_active", true)
        .not("page_slug", "is", null);
      return data ?? [];
    },
  });
  const cart = useCart();
  const startsOn = cart.startsOn || addDaysISO(todayISO(), 2);
  const endsOn = cart.endsOn || addDaysISO(todayISO(), 3);
  const days = rentalDays(startsOn, endsOn);
  const bookableOf = (item: SitePage) =>
    bookables.find((b) => b.page_type === item.type && b.page_slug === item.slug);
  const quickAdd = (item: SitePage) => {
    const b = bookableOf(item);
    if (!b) return;
    addToCart(
      {
        equipmentId: b.id,
        name: contentOf(item, lang).h1,
        image: catalogueImage(item),
        dailyPrice: Number(b.daily_price),
        quantity: 1,
        pageType: item.type === "kit" ? "kit" : "product",
        slug: item.slug,
      },
      { startsOn, endsOn },
    );
    toast.success(sv ? "Tillagd i varukorgen" : "Added to cart");
  };

  const categories = byType("category");
  const allItems = useMemo(() => [...byType("product"), ...byType("kit")], []);
  const items = allItems
    .filter((item) => {
      const matchesCategory =
        category === "all" ||
        (category === "kits" ? item.type === "kit" : item.category === category);
      const matchesSearch = `${contentOf(item, lang).h1} ${contentOf(item, lang).intro}`
        .toLocaleLowerCase(lang)
        .includes(search.toLocaleLowerCase(lang).trim());
      const price = priceFromOf(item);
      return matchesCategory && matchesSearch && (!price || price <= maxPrice);
    })
    .sort((a, b) =>
      sort === "price_asc"
        ? (priceFromOf(a) ?? 0) - (priceFromOf(b) ?? 0)
        : sort === "price_desc"
          ? (priceFromOf(b) ?? 0) - (priceFromOf(a) ?? 0)
          : sort === "name"
            ? contentOf(a, lang).h1.localeCompare(contentOf(b, lang).h1, lang)
            : 0,
    );

  const tabs = [
    { id: "all", label: sv ? "Visa alla" : "View all" },
    { id: "kits", label: sv ? "Paket" : "Kits" },
    ...categories.map((c) => ({ id: c.slug, label: catName(c, lang) })),
  ];
  const heading =
    page.type === "kits"
      ? sv
        ? "Paket"
        : "Kits"
      : page.type === "category"
        ? catName(page, lang)
        : sv
          ? "Utrustning"
          : "Equipment";
  const filtered = search || category !== "all" || maxPrice !== 5000;

  return (
    <div className="bg-background">
      <section className="container-page pt-8 md:pt-12">
        <h1 className="font-display text-3xl font-black uppercase text-foreground md:text-5xl">
          {heading}
        </h1>
        <nav
          aria-label={sv ? "Kategorier" : "Categories"}
          className="-mx-5 mt-5 overflow-x-auto px-5 [scrollbar-width:none]"
        >
          <ul className="flex gap-6 whitespace-nowrap">
            {tabs.map((tab) => (
              <li key={tab.id}>
                <button
                  type="button"
                  onClick={() => setCategory(tab.id)}
                  className={`border-b-2 pb-1 text-xs font-semibold uppercase tracking-wide transition-colors ${category === tab.id ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >
                  {tab.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-border py-3 text-xs">
          <span className="font-semibold uppercase text-foreground">
            {sv ? "Hyresperiod" : "Hire period"} · {days} {sv ? "dygn" : "days"}
          </span>
          <Input
            aria-label={sv ? "Startdatum" : "Start date"}
            type="date"
            min={addDaysISO(todayISO(), 1)}
            value={startsOn}
            onChange={(e) => {
              const n = e.target.value;
              if (n) setCartDates(n, n > endsOn ? n : endsOn);
            }}
            className="h-8 w-[136px] border-0 bg-transparent px-0 text-xs shadow-none"
          />
          <span className="text-muted-foreground">–</span>
          <Input
            aria-label={sv ? "Slutdatum" : "End date"}
            type="date"
            min={startsOn}
            value={endsOn}
            onChange={(e) => {
              if (e.target.value) setCartDates(startsOn, e.target.value);
            }}
            className="h-8 w-[136px] border-0 bg-transparent px-0 text-xs shadow-none"
          />
        </div>
      </section>

      <section className="container-page py-4">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase text-foreground">
            {items.length} {sv ? "produkter" : "items"}
          </span>
          <div className="flex items-center gap-2">
            {filtered && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setCategory("all");
                  setMaxPrice(5000);
                }}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" /> {sv ? "Rensa" : "Clear"}
              </button>
            )}
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              aria-label={sv ? "Filter och sortering" : "Filter and sort"}
              className="inline-flex items-center gap-2 text-xs font-semibold uppercase text-foreground hover:text-primary"
            >
              <span className="hidden sm:inline">{sv ? "Filter" : "Filter"}</span>
              <SlidersHorizontal className="h-4 w-4" />
            </button>
          </div>
        </div>

        {items.length ? (
          <div className="grid grid-cols-2 gap-x-0 gap-y-12 sm:grid-cols-4">
            {items.map((item) => {
              const b = bookableOf(item);
              const price = priceFromOf(item);
              return (
                <SiteLink
                  key={`${item.type}-${item.slug}`}
                  to={item.path[lang]}
                  className="group min-w-0"
                >
                  <div className="relative aspect-[2/3] overflow-hidden bg-studio">
                    <img
                      src={catalogueImage(item)}
                      alt={contentOf(item, lang).h1}
                      loading="lazy"
                      width={600}
                      height={900}
                      onError={(e) => {
                        const fb = imageOf(item);
                        if (fb && e.currentTarget.src !== fb) e.currentTarget.src = fb;
                      }}
                      className="h-full w-full object-contain p-4 mix-blend-multiply transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none"
                    />
                    {item.type === "kit" && (
                      <span className="absolute bottom-2 left-2 bg-ink px-1.5 py-0.5 text-[10px] font-semibold uppercase text-ink-foreground">
                        {sv ? "Paket" : "Kit"}
                      </span>
                    )}
                    {b && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          quickAdd(item);
                        }}
                        aria-label={sv ? "Lägg i varukorgen" : "Add to cart"}
                        className="absolute bottom-2 right-2 grid size-8 place-items-center rounded-full bg-ink text-ink-foreground transition hover:bg-primary hover:text-primary-foreground"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="truncate font-sans text-xs font-medium uppercase tracking-wide text-foreground lg:whitespace-normal lg:line-clamp-2 sm:text-[13px]">
                      {contentOf(item, lang).h1}
                    </h3>
                    {price ? (
                      <p className="mt-1 text-sm font-bold text-foreground">
                        {fmt(price)} kr{" "}
                        <span className="font-normal text-muted-foreground">
                          / {sv ? "vecka" : "week"}
                        </span>
                      </p>
                    ) : null}
                  </div>
                </SiteLink>
              );
            })}
          </div>
        ) : (
          <p className="py-16 text-center text-muted-foreground">
            {sv ? "Inga produkter matchar dina filter." : "No items match your filters."}
          </p>
        )}
      </section>

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent
          side="right"
          className="storefront-dark w-80 space-y-7 overflow-y-auto bg-background text-foreground"
        >
          <SheetTitle className="text-sm font-semibold uppercase">
            {sv ? "Filter & sortering" : "Filter & sort"}
          </SheetTitle>
          <label className="flex items-center gap-2 border-b border-border pb-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              aria-label={sv ? "Sök" : "Search"}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={sv ? "Sök skärm, stativ eller paket" : "Search screens, stands or kits"}
              className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
          <div>
            <p className="text-xs font-semibold uppercase">{sv ? "Sortera" : "Sort"}</p>
            <div className="mt-3 grid gap-2 text-sm">
              {(
                [
                  ["popular", sv ? "Populärast" : "Most popular"],
                  ["price_asc", sv ? "Pris: lägst först" : "Price: low to high"],
                  ["price_desc", sv ? "Pris: högst först" : "Price: high to low"],
                  ["name", sv ? "Namn A–Ö" : "Name A–Z"],
                ] as const
              ).map(([id, label]) => (
                <label key={id} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="sort"
                    checked={sort === id}
                    onChange={() => setSort(id)}
                    className="accent-primary"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase">{sv ? "Kategori" : "Category"}</p>
            <div className="mt-3 grid gap-2 text-sm">
              {tabs.map((tab) => (
                <label key={tab.id} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="cat"
                    checked={category === tab.id}
                    onChange={() => setCategory(tab.id)}
                    className="accent-primary"
                  />
                  {tab.label}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="catalogue-price" className="text-xs font-semibold uppercase">
              {sv ? "Maxpris per vecka" : "Maximum weekly price"}
            </label>
            <input
              id="catalogue-price"
              type="range"
              min="0"
              max="5000"
              step="100"
              value={maxPrice}
              onChange={(e) => setMaxPrice(Number(e.target.value))}
              className="mt-4 w-full accent-primary"
            />
            <div className="mt-1 flex justify-between text-xs text-muted-foreground">
              <span>0 kr</span>
              <span>{fmt(maxPrice)} kr</span>
            </div>
          </div>
          <Button className="w-full uppercase" onClick={() => setFiltersOpen(false)}>
            {sv ? `Visa ${items.length} produkter` : `Show ${items.length} items`}
          </Button>
        </SheetContent>
      </Sheet>
    </div>
  );
}
