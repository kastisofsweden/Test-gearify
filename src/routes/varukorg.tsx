import { createFileRoute } from "@tanstack/react-router";

import { CartView } from "@/components/site/CartView";

export const Route = createFileRoute("/varukorg")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Cart | Renthub.se" },
      {
        name: "description",
        content:
          "Review your selected AV equipment and adjust quantity and hire period before booking.",
      },
      { property: "og:title", content: "Cart | Renthub.se" },
      { property: "og:description", content: "Adjust quantity and hire period before booking." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <CartView lang="en" />,
});
