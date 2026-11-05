import { createFileRoute, notFound } from "@tanstack/react-router";

import { SitePage } from "@/components/site/SitePage";
import { findPage, pageHead, pageOf } from "@/lib/site";

const LANG = "en" as const;

export const Route = createFileRoute("/en/kit/")({
  head: () => pageHead(pageOf("kits"), LANG),
  component: Page,
});

function Page() {
  return <SitePage page={pageOf("kits")} lang={LANG} />;
}
