import { createFileRoute, notFound } from "@tanstack/react-router";

import { SitePage } from "@/components/site/SitePage";
import { findPage, pageHead, pageOf } from "@/lib/site";

const LANG = "en" as const;

function resolve(slug: string) {
  return findPage("landing", slug) ?? findPage("info", slug);
}

export const Route = createFileRoute("/en/$slug")({
  loader: ({ params }) => {
    if (!resolve(params.slug)) throw notFound();
    return null;
  },
  head: ({ params }) => pageHead(resolve(params.slug), LANG),
  component: Page,
});

function Page() {
  const { slug } = Route.useParams();
  const page = resolve(slug);
  if (!page) return null;
  return <SitePage page={page} lang={LANG} />;
}
