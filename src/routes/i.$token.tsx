import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { BrandLogo } from "@/components/BrandLogo";
import { SiteLink } from "@/components/site/SiteLink";
import { UNIT_CONTACT_EMAIL, UnitReportForm } from "@/components/site/UnitReportForm";
import { contentOf, findPage, imageOf, type PageType } from "@/lib/site";
import { getPublicUnit, type PublicUnit } from "@/lib/units.functions";

export const Route = createFileRoute("/i/$token")({
  loader: ({ params }) => getPublicUnit({ data: { token: params.token } }),
  head: ({ loaderData }) => {
    const title = loaderData
      ? `Item ${loaderData.serial_code ?? loaderData.unit_number} · ${loaderData.name} | Renthub.se`
      : "Item | Renthub.se";
    const description =
      "Equipment from renthub.se / Dream Group Sweden. Leave a note or report a fault.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { name: "robots", content: "noindex, nofollow" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  errorComponent: () => (
    <UnitShell>
      <NotFound />
    </UnitShell>
  ),
  component: UnitPage,
});

function UnitShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="storefront-dark min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-2xl items-center px-5">
          <SiteLink to="/" className="inline-flex">
            <BrandLogo variant="white" className="h-6 w-auto max-w-[160px] object-left" />
          </SiteLink>
        </div>
      </header>
      <main className="mx-auto grid max-w-2xl gap-6 px-5 py-8">{children}</main>
    </div>
  );
}

function Contact() {
  return (
    <p className="text-sm text-muted-foreground">
      Contact:{" "}
      <a
        className="text-primary underline-offset-4 hover:underline"
        href={`mailto:${UNIT_CONTACT_EMAIL}`}
      >
        {UNIT_CONTACT_EMAIL}
      </a>
    </p>
  );
}

function NotFound() {
  return (
    <section className="grid gap-3 rounded-2xl border border-border bg-card p-6">
      <h1 className="font-display text-2xl tracking-wide">No item found for this code</h1>
      <p className="text-sm text-muted-foreground">
        Check that the whole code was scanned. Need help? Get in touch and we will help you.
      </p>
      <Contact />
    </section>
  );
}

function productLink(unit: PublicUnit) {
  if (!unit.page_type || !unit.page_slug) return null;
  return findPage(unit.page_type as PageType, unit.page_slug) ?? null;
}

function UnitPage() {
  const unit = Route.useLoaderData();
  const { token } = Route.useParams();
  const [retired, setRetired] = useState(false);

  if (!unit) {
    return (
      <UnitShell>
        <NotFound />
      </UnitShell>
    );
  }

  const page = productLink(unit);
  const image = unit.image_url || (page ? imageOf(page) : null);
  const fallbackIntro = page ? contentOf(page, "en").intro : "";
  const rawDescription = unit.description || fallbackIntro || "";
  const description =
    rawDescription.length > 300 ? `${rawDescription.slice(0, 297)}…` : rawDescription;
  const isRetired = unit.is_retired || retired;

  return (
    <UnitShell>
      <section className="grid gap-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            S/N
          </p>
          <h1 className="mt-1 break-all font-mono text-3xl font-bold tracking-tight sm:text-5xl">
            {unit.serial_code ?? unit.unit_number}
          </h1>
          <p className="mt-2 text-lg font-semibold">{unit.name}</p>
        </div>

        {image ? (
          <div className="flex aspect-video items-center justify-center overflow-hidden rounded-2xl border border-border bg-card">
            <img
              src={image}
              alt={unit.name}
              className="h-full w-full object-contain"
              loading="eager"
            />
          </div>
        ) : null}

        {description ? (
          <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
        ) : null}

        {page ? (
          <SiteLink
            to={page.path.en}
            className="w-fit text-sm font-semibold text-primary underline-offset-4 hover:underline"
          >
            View the product on renthub.se →
          </SiteLink>
        ) : null}
      </section>

      {isRetired ? (
        <section role="status" className="grid gap-2 rounded-2xl border border-border bg-card p-6">
          <h2 className="font-display text-xl tracking-wide">This item has been retired</h2>
          <p className="text-sm text-muted-foreground">
            This equipment is no longer in use. Found it, or have questions? Get in touch.
          </p>
          <Contact />
        </section>
      ) : (
        <section className="grid gap-5 rounded-2xl border border-border bg-card p-5 sm:p-6">
          <div className="grid gap-2">
            <h2 className="font-display text-xl tracking-wide">Note or fault report</h2>
            <p className="text-sm text-muted-foreground">
              This equipment belongs to renthub.se / Dream Group Sweden. Found it, or is something
              wrong? Leave a note or fault report below.
            </p>
            <Contact />
          </div>
          <UnitReportForm
            token={token}
            unitNumber={unit.serial_code ?? unit.unit_number}
            onRetired={() => setRetired(true)}
          />
        </section>
      )}
    </UnitShell>
  );
}
