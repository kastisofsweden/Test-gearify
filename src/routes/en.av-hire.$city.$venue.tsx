import { createFileRoute, notFound } from "@tanstack/react-router";

import { SitePage } from "@/components/site/SitePage";
import { findPage, pageHead, pageOf } from "@/lib/site";

const LANG = "en" as const;

export const Route = createFileRoute("/en/av-hire/$city/$venue")({
  loader: ({ params }) => {
    if (!findPage("venue", params.venue)) throw notFound();
    return null;
  },
  head: ({ params }) => pageHead(findPage("venue", params.venue), LANG),
  component: Page,
});

function Page() {
  const params = Route.useParams();
  const page = findPage("venue", params.venue);
  if (!page) return null;
  return <SitePage page={page} lang={LANG} />;
}
