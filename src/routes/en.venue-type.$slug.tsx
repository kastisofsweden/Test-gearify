import { createFileRoute, notFound } from "@tanstack/react-router";

import { SitePage } from "@/components/site/SitePage";
import { findPage, pageHead, pageOf } from "@/lib/site";

const LANG = "en" as const;

export const Route = createFileRoute("/en/venue-type/$slug")({
  loader: ({ params }) => {
    if (!findPage("venue_type", params.slug)) throw notFound();
    return null;
  },
  head: ({ params }) => pageHead(findPage("venue_type", params.slug), LANG),
  component: Page,
});

function Page() {
  const { slug } = Route.useParams();
  const page = findPage("venue_type", slug);
  if (!page) return null;
  return <SitePage page={page} lang={LANG} />;
}
