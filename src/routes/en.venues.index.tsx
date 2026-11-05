import { createFileRoute, notFound } from "@tanstack/react-router";

import { SitePage } from "@/components/site/SitePage";
import { findPage, pageHead, pageOf } from "@/lib/site";

const LANG = "en" as const;

export const Route = createFileRoute("/en/venues/")({
  head: () => pageHead(pageOf("venues"), LANG),
  component: Page,
});

function Page() {
  return <SitePage page={pageOf("venues")} lang={LANG} />;
}
