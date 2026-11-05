import { createFileRoute, notFound } from "@tanstack/react-router";

import { SitePage } from "@/components/site/SitePage";
import { findPage, pageHead, pageOf } from "@/lib/site";

const LANG = "en" as const;

export const Route = createFileRoute("/")({
  head: () => pageHead(pageOf("home"), LANG),
  component: Page,
});

function Page() {
  return <SitePage page={pageOf("home")} lang={LANG} />;
}
