import { createFileRoute } from "@tanstack/react-router";

import { OrderView } from "@/components/site/OrderView";
import { getOrderByToken } from "@/lib/orders.functions";

export const Route = createFileRoute("/order/$token")({
  loader: ({ params }) => getOrderByToken({ data: { token: params.token } }),
  errorComponent: () => <OrderView order={null} lang="en" />,
  notFoundComponent: () => <OrderView order={null} lang="en" />,
  head: () => ({
    meta: [
      { title: "Your booking | Renthub.se" },
      {
        name: "description",
        content: "Track your AV equipment booking: period, items and status.",
      },
      { property: "og:title", content: "Your booking | Renthub.se" },
      { property: "og:description", content: "Period, items and status of your booking." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

function Page() {
  const order = Route.useLoaderData();
  return <OrderView order={order} lang="en" />;
}
