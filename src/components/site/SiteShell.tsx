import { useEffect, useState, type ReactNode } from "react";
import { Menu, Search } from "lucide-react";

import { BrandLogo } from "@/components/BrandLogo";
import { HirePeriodBar } from "@/components/site/HirePeriodBar";
import { CartButton } from "@/components/site/CartButton";
import { SiteLink } from "@/components/site/SiteLink";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { COMPANY, NAV, byType, findPage, t, type Lang, type SitePage } from "@/lib/site";

export function SiteShell({
  lang,
  page,
  children,
}: {
  lang: Lang;
  page?: SitePage | undefined;
  children: ReactNode;
}) {
  const nav = NAV(lang);
  const contact = findPage("info", "contact")!;
  const [signedIn, setSignedIn] = useState(false);
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
    const { data } = supabase.auth.onAuthStateChange((_e, session) =>
      setSignedIn(Boolean(session)),
    );
    return () => data.subscription.unsubscribe();
  }, []);

  return (
    <div className="storefront-dark flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-xl">
        <div
          className={`container-page flex items-center justify-between gap-6 transition-[height] duration-200 ${scrolled ? "h-12" : "h-16"}`}
        >
          <SiteLink
            to={lang === "sv" ? "/" : "/en"}
            aria-label="Renthub.se home"
            className="min-w-0 shrink-0"
          >
            <BrandLogo
              variant="white"
              className="h-6 w-auto max-w-[150px] object-left sm:h-7 sm:max-w-[190px]"
            />
          </SiteLink>

          <nav className="hidden flex-1 items-center gap-5 md:flex lg:gap-6">
            {nav.map((item) => (
              <SiteLink
                key={item.href}
                to={item.href}
                className="text-xs font-semibold uppercase tracking-wide text-foreground/80 transition-colors hover:text-primary"
              >
                {item.label}
              </SiteLink>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <SiteLink
              to={lang === "sv" ? "/hyra" : "/en/rent"}
              aria-label={lang === "sv" ? "Sök" : "Search"}
              className="text-foreground hover:text-primary"
            >
              <Search className="h-5 w-5" />
            </SiteLink>
            <CartButton lang={lang} />
            {signedIn ? (
              <SiteLink
                to="/admin"
                className="hidden text-sm font-medium text-muted-foreground hover:text-primary sm:block"
              >
                {t("admin", lang)}
              </SiteLink>
            ) : (
              <Button asChild variant="ghost" size="sm" className="hidden md:inline-flex">
                <SiteLink to="/auth">Log in</SiteLink>
              </Button>
            )}
            <Button asChild className="hidden shadow-button lg:inline-flex">
              <SiteLink to={contact.path[lang]}>{t("cta_quote", lang)}</SiteLink>
            </Button>
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="md:hidden">
                  <Menu className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="right"
                className="storefront-dark w-72 bg-background text-foreground"
              >
                <SheetTitle className="mb-6 flex items-center gap-3">
                  <BrandLogo variant="white" className="h-7 w-auto max-w-[190px]" />
                </SheetTitle>
                <nav className="grid gap-4">
                  {nav.map((item) => (
                    <SiteLink
                      key={item.href}
                      to={item.href}
                      className="text-base font-medium text-foreground"
                    >
                      {item.label}
                    </SiteLink>
                  ))}
                  <Button asChild variant="outline" className="justify-start">
                    <SiteLink to={signedIn ? "/admin" : "/auth"}>
                      {signedIn ? "Back office" : "Log in"}
                    </SiteLink>
                  </Button>
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      {!page || !["home", "catalog", "kits", "category", "product", "kit"].includes(page.type) ? (
        <HirePeriodBar lang={lang} />
      ) : null}

      <main className="flex-1">{children}</main>

      <footer className="mt-24 bg-ink text-ink-foreground">
        <div className="container-page grid gap-10 py-16 md:grid-cols-4">
          <div>
            <BrandLogo variant="white" className="h-8 w-auto max-w-[220px] object-left" />
            <p className="mt-4 text-sm text-ink-foreground/70">{t("footer_company", lang)}</p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-ink-foreground/60">
              {t("products", lang)}
            </p>
            <ul className="mt-4 space-y-2 text-sm">
              {byType("product").map((p) => (
                <li key={p.slug}>
                  <SiteLink
                    to={p.path[lang]}
                    className="text-ink-foreground/80 hover:text-ink-foreground"
                  >
                    {p.content[lang].h1}
                  </SiteLink>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-ink-foreground/60">
              {t("event_types", lang)}
            </p>
            <ul className="mt-4 space-y-2 text-sm">
              {byType("landing").map((p) => (
                <li key={p.slug}>
                  <SiteLink
                    to={p.path[lang]}
                    className="text-ink-foreground/80 hover:text-ink-foreground"
                  >
                    {p.content[lang].h1}
                  </SiteLink>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-ink-foreground/60">
              {t("nav_contact", lang)}
            </p>
            <ul className="mt-4 space-y-2 text-sm text-ink-foreground/80">
              <li>{COMPANY.legal}</li>
              <li>{COMPANY.address}</li>
              <li>
                <a href={`mailto:${COMPANY.email}`} className="hover:text-ink-foreground">
                  {COMPANY.email}
                </a>
              </li>
              <li>
                <a
                  href={`tel:${COMPANY.phone.replace(/[^\d+]/g, "")}`}
                  className="hover:text-ink-foreground"
                >
                  {COMPANY.phone}
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-ink-foreground/10">
          <div className="container-page py-6 text-xs text-ink-foreground/60">
            © {new Date().getFullYear()} {COMPANY.legal}. {t("footer_rights", lang)}
          </div>
        </div>
      </footer>
    </div>
  );
}
