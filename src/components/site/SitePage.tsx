import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { galleryImages } from "@/lib/catalogue-images";

import { BookingWidget } from "@/components/site/BookingWidget";
import { CatalogueExperience } from "@/components/site/CatalogueExperience";
import { QuoteForm } from "@/components/site/QuoteForm";
import { SiteLink } from "@/components/site/SiteLink";
import { SiteShell } from "@/components/site/SiteShell";
import { Button } from "@/components/ui/button";
import {
  byType,
  contentOf,
  findPage,
  imageOf,
  pageOf,
  priceLabel,
  resolveLink,
  t,
  type Lang,
  type Section,
  type SitePage as SitePageType,
} from "@/lib/site";

function Hero({ page, lang }: { page: SitePageType; lang: Lang }) {
  const c = contentOf(page, lang);
  const contact = findPage("info", "contact")!;
  const catalog = pageOf("catalog");
  const price = page.type === "product" || page.type === "kit" ? priceLabel(page, lang) : "";
  const wide = page.type === "home";
  const image = imageOf(page);

  return (
    <section className="border-b border-border bg-secondary/60">
      <div
        className={`container-page grid items-center gap-10 py-14 md:py-20 ${
          image ? "lg:grid-cols-2" : ""
        }`}
      >
        <div>
          {c.eyebrow ? <p className="eyebrow-label">{c.eyebrow}</p> : null}
          <h1
            className={`mt-3 font-bold text-foreground ${
              wide ? "text-4xl md:text-6xl" : "text-3xl md:text-5xl"
            }`}
          >
            {c.h1}
          </h1>
          {c.intro ? (
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              {c.intro}
            </p>
          ) : null}
          {price ? <p className="mt-6 text-xl font-semibold text-primary">{price}</p> : null}
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="shadow-button">
              <SiteLink to={contact.path[lang]}>{t("cta_quote", lang)}</SiteLink>
            </Button>
            <Button asChild size="lg" variant="outline">
              <SiteLink to={catalog.path[lang]}>{t("cta_browse", lang)}</SiteLink>
            </Button>
          </div>
        </div>
        {image ? (
          <div className="overflow-hidden rounded-lg shadow-panel">
            <img
              src={image}
              alt={c.h1}
              className="aspect-[4/3] h-full w-full object-cover"
              loading="eager"
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ProductDetail({ page, lang }: { page: SitePageType; lang: Lang }) {
  const c = contentOf(page, lang);
  const images = galleryImages(page);
  const isKit = page.type === "kit";
  const [slide, setSlide] = useState(0);
  const badge = isKit ? (lang === "sv" ? "Paket" : "Kit") : c.eyebrow;
  const img = (src: string, i: number, cls: string) => (
    <div key={src} className={`overflow-hidden bg-studio ${cls}`}>
      <img
        src={src}
        alt={`${c.h1}${i ? ` ${i + 1}` : ""}`}
        loading={i ? "lazy" : "eager"}
        className="h-full w-full object-contain p-6 mix-blend-multiply"
      />
    </div>
  );

  return (
    <section className="md:container-page md:py-8">
      <div className="grid items-start md:grid-cols-[minmax(0,65fr)_minmax(0,35fr)] md:gap-8 lg:gap-12">
        <div>
          <div className="md:hidden">
            <div
              className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]"
              onScroll={(e) =>
                setSlide(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))
              }
            >
              {images.map((src, i) => img(src, i, "aspect-[2/3] w-full shrink-0 snap-center"))}
            </div>
            {images.length > 1 ? (
              <div className="flex justify-center gap-1.5 py-3">
                {images.map((src, i) => (
                  <span
                    key={src}
                    className={`size-1.5 rounded-full ${i === slide ? "bg-foreground" : "bg-muted-foreground/40"}`}
                  />
                ))}
              </div>
            ) : null}
          </div>
          <div className="hidden md:block">
            {images[0] ? img(images[0], 0, "aspect-[4/5] w-full") : null}
            {images.length > 1 ? (
              <div className="grid grid-cols-2">
                {images.slice(1).map((src, i) => img(src, i + 1, "aspect-[2/3]"))}
              </div>
            ) : null}
          </div>
        </div>
        <div className="container-page py-6 md:sticky md:top-24 md:w-auto md:max-w-none md:px-0 md:py-0">
          {badge ? (
            <span className="inline-block bg-ink px-1.5 py-0.5 text-[10px] font-semibold uppercase text-ink-foreground">
              {badge}
            </span>
          ) : null}
          <h1 className="mt-3 font-sans text-lg font-semibold uppercase leading-snug tracking-wide text-foreground md:text-xl">
            {c.h1}
          </h1>
          <div className="mt-3">
            <BookingWidget page={page} lang={lang} />
          </div>
        </div>
      </div>
    </section>
  );
}

function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i} className="font-semibold text-foreground">
            {part.slice(2, -2)}
          </strong>
        ) : (
          part.replace(/\*\*/g, "")
        ),
      )}
    </>
  );
}

function ItemCard({ item, lang }: { item: Section["items"][number]; lang: Lang }) {
  const href = resolveLink(item.link, lang);
  const inner = (
    <div className="group flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card shadow-card transition-shadow hover:shadow-panel">
      {item.image ? (
        <div className="aspect-[16/9] overflow-hidden bg-muted">
          <img
            src={item.image}
            alt={item.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        </div>
      ) : null}
      <div className="flex flex-1 flex-col p-6">
        <h3 className="text-lg font-semibold text-foreground">{item.title}</h3>
        {item.body ? (
          <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
            <RichText text={item.body} />
          </p>
        ) : null}
        {item.price ? <p className="mt-4 font-semibold text-primary">{item.price}</p> : null}
        {href ? (
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">
            {t("read_more", lang)} <ArrowRight className="h-4 w-4" />
          </span>
        ) : null}
      </div>
    </div>
  );
  return href ? (
    <SiteLink to={href} className="h-full">
      {inner}
    </SiteLink>
  ) : (
    inner
  );
}

function Sections({ sections, lang }: { sections: Section[]; lang: Lang }) {
  return (
    <>
      {sections.map((section, index) => (
        <section
          key={`${section.heading}-${index}`}
          className={index % 2 === 1 ? "bg-muted/60 py-16" : "py-16"}
        >
          <div className="container-page">
            {section.eyebrow ? <p className="eyebrow-label">{section.eyebrow}</p> : null}
            {section.heading ? (
              <h2 className="mt-3 max-w-3xl text-2xl font-bold text-foreground md:text-3xl">
                {section.heading}
              </h2>
            ) : null}
            {section.body ? (
              <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted-foreground">
                {section.body}
              </p>
            ) : null}
            {section.items.length ? (
              <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {section.items.map((item, i) => (
                  <ItemCard key={`${item.title}-${i}`} item={item} lang={lang} />
                ))}
              </div>
            ) : null}
          </div>
        </section>
      ))}
    </>
  );
}

function PageGrid({
  title,
  pages,
  lang,
  muted = false,
}: {
  title: string;
  pages: SitePageType[];
  lang: Lang;
  muted?: boolean;
}) {
  if (!pages.length) return null;
  return (
    <section className={muted ? "bg-muted/60 py-16" : "py-16"}>
      <div className="container-page">
        <h2 className="text-2xl font-bold text-foreground md:text-3xl">{title}</h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {pages.map((p) => {
            const c = contentOf(p, lang);
            return (
              <SiteLink key={p.slug} to={p.path[lang]} className="h-full">
                <div className="group flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card shadow-card transition-shadow hover:shadow-panel">
                  {imageOf(p) ? (
                    <div className="aspect-[16/9] overflow-hidden bg-muted">
                      <img
                        src={imageOf(p)}
                        alt={c.h1}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    </div>
                  ) : null}
                  <div className="flex flex-1 flex-col p-6">
                    <h3 className="text-lg font-semibold text-foreground">{c.h1}</h3>
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                      {c.intro.slice(0, 140)}
                      {c.intro.length > 140 ? "…" : ""}
                    </p>
                    {(p.type === "product" || p.type === "kit") && priceLabel(p, lang) ? (
                      <p className="mt-4 font-semibold text-primary">{priceLabel(p, lang)}</p>
                    ) : null}
                  </div>
                </div>
              </SiteLink>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Details({ page, lang }: { page: SitePageType; lang: Lang }) {
  const c = contentOf(page, lang);
  if (!c.included.length && !c.specs.length) return null;
  return (
    <section className="py-16">
      <div className="container-page grid gap-10 md:grid-cols-2">
        {c.included.length ? (
          <div className="rounded-lg border border-border bg-card p-8 shadow-card">
            <h2 className="text-xl font-bold text-foreground">{t("included", lang)}</h2>
            <ul className="mt-6 space-y-3">
              {c.included.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {c.specs.length ? (
          <div className="rounded-lg border border-border bg-card p-8 shadow-card">
            <h2 className="text-xl font-bold text-foreground">{t("specs", lang)}</h2>
            <dl className="mt-6 divide-y divide-border">
              {c.specs.map((spec) => (
                <div key={spec.label} className="flex justify-between gap-6 py-3 text-sm">
                  <dt className="text-muted-foreground">{spec.label}</dt>
                  <dd className="font-medium text-foreground">{spec.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function QuoteSection({ lang }: { lang: Lang }) {
  return (
    <section id="quote" className="bg-secondary/60 py-20">
      <div className="container-page grid gap-10 lg:grid-cols-[1fr_1.2fr]">
        <div>
          <p className="eyebrow-label">{t("cta_quote", lang)}</p>
          <h2 className="mt-3 text-3xl font-bold text-foreground">{t("form_title", lang)}</h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            {t("form_lead", lang)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-8 shadow-card">
          <QuoteForm lang={lang} />
        </div>
      </div>
    </section>
  );
}

export function SitePage({ page, lang }: { page: SitePageType; lang: Lang }) {
  const c = contentOf(page, lang);
  const products = byType("product");
  const kits = byType("kit");

  return (
    <SiteShell lang={lang} page={page}>
      {["home", "catalog", "kits", "category"].includes(page.type) ? (
        <CatalogueExperience page={page} lang={lang} />
      ) : page.type === "product" || page.type === "kit" ? (
        <ProductDetail page={page} lang={lang} />
      ) : (
        <Hero page={page} lang={lang} />
      )}

      {!(["home", "catalog", "kits", "category", "product", "kit"] as string[]).includes(
        page.type,
      ) && <Details page={page} lang={lang} />}

      {page.type === "venues" ? (
        <>
          <PageGrid title={t("venues_in", lang)} pages={byType("venue")} lang={lang} />
          <PageGrid title={t("venue_types", lang)} pages={byType("venue_type")} lang={lang} muted />
        </>
      ) : null}

      {page.type === "city" ? (
        <PageGrid
          title={t("venues_in", lang)}
          pages={byType("venue").filter((p) => p.city === page.slug)}
          lang={lang}
        />
      ) : null}

      {!(["home", "catalog", "kits", "category"] as string[]).includes(page.type) && (
        <Sections sections={c.sections} lang={lang} />
      )}

      {page.type === "venue_type" ? (
        <PageGrid title={t("kits", lang)} pages={kits} lang={lang} muted />
      ) : null}

      <QuoteSection lang={lang} />
    </SiteShell>
  );
}
