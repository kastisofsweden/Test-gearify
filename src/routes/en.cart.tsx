import { createFileRoute } from "@tanstack/react-router";

import { CartView } from "@/components/site/CartView";

export const Route = createFileRoute("/en/cart")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Cart | Renthub.se" },
      {
        name: "description",
        content: "Review your selected AV equipment, quantities and rental period before booking.",
      },
      { property: "og:title", content: "Cart | Renthub.se" },
      { property: "og:description", content: "Adjust quantities and dates before you book." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <CartView lang="en" />,
});
