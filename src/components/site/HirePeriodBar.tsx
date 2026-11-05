import { CalendarRange } from "lucide-react";

import { useCart } from "@/components/site/CartButton";
import { Input } from "@/components/ui/input";
import { addDaysISO, todayISO } from "@/lib/booking";
import { rentalDays, setCartDates } from "@/lib/cart";
import { type Lang } from "@/lib/site";

/** Global hire-period filter — dates chosen here follow the visitor across the catalogue. */
export function HirePeriodBar({ lang }: { lang: Lang }) {
  const cart = useCart();
  const startsOn = cart.startsOn || addDaysISO(todayISO(), 2);
  const endsOn = cart.endsOn || addDaysISO(todayISO(), 3);
  const days = rentalDays(startsOn, endsOn);

  return (
    <div className="border-b border-border bg-secondary/40">
      <div className="container-page flex flex-wrap items-center gap-4 py-3">
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
          <CalendarRange className="h-4 w-4" />
          {lang === "sv" ? "Hyresperiod" : "Hire period"}
        </span>

        <div className="flex items-center gap-2">
          <Input
            aria-label={lang === "sv" ? "Startdatum" : "Start date"}
            type="date"
            className="h-9 w-[150px] bg-background"
            value={startsOn}
            min={addDaysISO(todayISO(), 1)}
            onChange={(e) => {
              const next = e.target.value;
              if (!next) return;
              setCartDates(next, next > endsOn ? next : endsOn);
            }}
          />
          <span className="text-muted-foreground">–</span>
          <Input
            aria-label={lang === "sv" ? "Slutdatum" : "End date"}
            type="date"
            className="h-9 w-[150px] bg-background"
            value={endsOn}
            min={startsOn}
            onChange={(e) => {
              if (e.target.value) setCartDates(startsOn, e.target.value);
            }}
          />
        </div>

        <span className="text-sm text-muted-foreground">
          {days > 0
            ? lang === "sv"
              ? `${days} dygn`
              : `${days} ${days === 1 ? "day" : "days"}`
            : lang === "sv"
              ? "Välj datum"
              : "Select dates"}
        </span>

        <span className="ml-auto hidden text-sm text-muted-foreground md:block">
          {lang === "sv"
            ? "Välj datum en gång – pris och tillgänglighet följer med genom katalogen."
            : "Set your dates once — availability and pricing follow you across the catalogue."}
        </span>
      </div>
    </div>
  );
}
