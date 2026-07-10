import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { BlockStack, Card, InlineGrid, Text } from "@shopify/polaris";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

type DailyPoint = {
  date: string;
  carts: number;
  checkouts: number;
};

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function buildDailyPoints(cartDates: Date[], checkoutDates: Date[]) {
  const today = startOfDay(new Date());
  const days: DailyPoint[] = [];

  for (let i = 29; i >= 0; i -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    days.push({ date: isoDay(date), carts: 0, checkouts: 0 });
  }

  const byDate = new Map(days.map((day) => [day.date, day]));

  for (const value of cartDates) {
    const key = isoDay(new Date(value));
    const point = byDate.get(key);
    if (point) point.carts += 1;
  }

  for (const value of checkoutDates) {
    const key = isoDay(new Date(value));
    const point = byDate.get(key);
    if (point) point.checkouts += 1;
  }

  return days;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [recentCarts, recentCheckouts, carts7, checkouts7, cartRows, checkoutRows] = await Promise.all([
    prisma.customerCart.count({
      where: { shop, lastItemAddedAt: { gte: since30 } },
    }),
    prisma.abandonedCheckoutReminder.count({
      where: { shop, checkoutCreatedAt: { gte: since30 } },
    }),
    prisma.customerCart.count({
      where: { shop, lastItemAddedAt: { gte: since7 } },
    }),
    prisma.abandonedCheckoutReminder.count({
      where: { shop, checkoutCreatedAt: { gte: since7 } },
    }),
    prisma.customerCart.findMany({
      where: { shop, lastItemAddedAt: { gte: since30 } },
      select: { lastItemAddedAt: true },
      take: 1000,
    }),
    prisma.abandonedCheckoutReminder.findMany({
      where: { shop, checkoutCreatedAt: { gte: since30 } },
      select: { checkoutCreatedAt: true },
      take: 1000,
    }),
  ]);

  const daily = buildDailyPoints(
    cartRows.map((row) => row.lastItemAddedAt),
    checkoutRows.map((row) => row.checkoutCreatedAt),
  );

  const maxValue = Math.max(1, ...daily.map((point) => point.carts + point.checkouts));

  return json({
    shop,
    recentCarts,
    recentCheckouts,
    carts7,
    checkouts7,
    daily,
    maxValue,
  });
}

function MetricCard({ label, value, help }: { label: string; value: number; help: string }) {
  return (
    <Card>
      <BlockStack gap="150">
        <Text as="p" tone="subdued">{label}</Text>
        <Text as="h2" variant="heading2xl">{value}</Text>
        <Text as="p" tone="subdued">{help}</Text>
      </BlockStack>
    </Card>
  );
}

export default function DashboardPage() {
  const data = useLoaderData<typeof loader>();

  return (
    <BlockStack gap="500">
      <section>
        <BlockStack gap="150">
          <Text as="h1" variant="headingLg">Dashboard</Text>
          <Text as="p" tone="subdued">{data.shop} · cart reminder overview</Text>
        </BlockStack>
      </section>

      <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
        <MetricCard label="30-day logged-in carts" value={data.recentCarts} help="Logged-in carts by last item add or quantity increase." />
        <MetricCard label="30-day abandoned checkouts" value={data.recentCheckouts} help="Synced recovery records." />
        <MetricCard label="7-day logged-in carts" value={data.carts7} help="Recent cart item additions." />
        <MetricCard label="7-day abandoned checkouts" value={data.checkouts7} help="Recent checkout abandonment." />
      </InlineGrid>

      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">Last 30 days activity</Text>
          <div style={{ display: "flex", alignItems: "end", gap: 6, height: 180, padding: "16px 4px 4px", borderBottom: "1px solid #e5e7eb" }}>
            {data.daily.map((point) => {
              const total = point.carts + point.checkouts;
              const height = Math.max(4, Math.round((total / data.maxValue) * 150));
              return (
                <div key={point.date} title={`${point.date}: ${point.carts} carts, ${point.checkouts} checkouts`} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "end", alignItems: "center", gap: 2 }}>
                  <div style={{ width: "100%", maxWidth: 18, height, borderRadius: "6px 6px 0 0", background: "#1f2937" }} />
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", color: "#6b7280", fontSize: 12 }}>
            <span>30 days ago</span>
            <span>Today</span>
          </div>
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="200">
          <Text as="h2" variant="headingMd">Recommended current setup</Text>
          <Text as="p" tone="subdued">
            While Casper is still active, keep Auto cart sync OFF and use this app for tracking, history, draft order creation, and later reminder emails.
          </Text>
        </BlockStack>
      </Card>
    </BlockStack>
  );
}
