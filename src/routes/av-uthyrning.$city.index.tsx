import { createFileRoute, notFound } from "@tanstack/react-router";

import { SitePage } from "@/components/site/SitePage";
import { findPage, pageHead, pageOf } from "@/lib/site";

const LANG = "en" as const;

export const Route = createFileRoute("/av-uthyrning/$city/")({
  loader: ({ params }) => {
    if (!findPage("city", params.city)) throw notFound();
    return null;
  },
  head: ({ params }) => pageHead(findPage("city", params.city), LANG),
  component: Page,
});

function Page() {
  const params = Route.useParams();
  const page = findPage("city", params.city);
  if (!page) return null;
  return <SitePage page={page} lang={LANG} />;
}
