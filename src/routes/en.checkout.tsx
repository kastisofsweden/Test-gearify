import { createFileRoute } from "@tanstack/react-router";

import { CheckoutView } from "@/components/site/CheckoutView";

export const Route = createFileRoute("/en/checkout")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Checkout | Renthub.se" },
      {
        name: "description",
        content: "Choose pick-up or delivery, add your details and place your AV rental booking.",
      },
      { property: "og:title", content: "Checkout | Renthub.se" },
      { property: "og:description", content: "Complete your AV equipment booking." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <CheckoutView lang="en" />,
});
