import { createFileRoute, notFound } from "@tanstack/react-router";

import { SitePage } from "@/components/site/SitePage";
import { findPage, pageHead, pageOf } from "@/lib/site";

const LANG = "en" as const;

export const Route = createFileRoute("/en/rent/$slug")({
  loader: ({ params }) => {
    if (!findPage("product", params.slug)) throw notFound();
    return null;
  },
  head: ({ params }) => pageHead(findPage("product", params.slug), LANG),
  component: Page,
});

function Page() {
  const { slug } = Route.useParams();
  const page = findPage("product", slug);
  if (!page) return null;
  return <SitePage page={page} lang={LANG} />;
}
