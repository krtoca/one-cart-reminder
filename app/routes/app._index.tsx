import type { LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData, useLocation } from "@remix-run/react";
import { Badge, BlockStack, Button, Card, InlineGrid, Text } from "@shopify/polaris";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

function statusTone(value: boolean | undefined) {
  return value ? "success" : "critical";
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function buildDailySeries(carts: { lastCapturedAt: Date }[], checkouts: { checkoutCreatedAt: Date }[]) {
  const days = Array.from({ length: 30 }).map((_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (29 - index));
    return { date: dayKey(date), carts: 0, checkouts: 0 };
  });
  const byDate = new Map(days.map((d) => [d.date, d]));
  for (const cart of carts) {
    const key = dayKey(cart.lastCapturedAt);
    const row = byDate.get(key);
    if (row) row.carts += 1;
  }
  for (const checkout of checkouts) {
    const key = dayKey(checkout.checkoutCreatedAt);
    const row = byDate.get(key);
    if (row) row.checkouts += 1;
  }
  return days.map((d) => ({ ...d, total: d.carts + d.checkouts }));
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [setting, cartsReady, checkoutsReady, sentLogs, failedLogs, recentCarts, recentCheckouts, recentCartRows, recentCheckoutRows] = await Promise.all([
    prisma.cartReminderSetting.findUnique({ where: { shop } }),
    prisma.customerCart.count({ where: { shop, reminderSentAt: null, orderedAt: null } }),
    prisma.abandonedCheckoutReminder.count({ where: { shop, reminderSentAt: null, checkoutCompletedAt: null } }),
    prisma.reminderEmailLog.count({ where: { shop, ok: true } }),
    prisma.reminderEmailLog.count({ where: { shop, ok: false } }),
    prisma.customerCart.count({ where: { shop, lastCapturedAt: { gte: since30 } } }),
    prisma.abandonedCheckoutReminder.count({ where: { shop, checkoutCreatedAt: { gte: since30 } } }),
    prisma.customerCart.findMany({ where: { shop, lastCapturedAt: { gte: since30 } }, select: { lastCapturedAt: true } }),
    prisma.abandonedCheckoutReminder.findMany({ where: { shop, checkoutCreatedAt: { gte: since30 } }, select: { checkoutCreatedAt: true } }),
  ]);

  const series = buildDailySeries(recentCartRows, recentCheckoutRows);
  return { shop, setting, cartsReady, checkoutsReady, sentLogs, failedLogs, recentCarts, recentCheckouts, series };
}

function MetricCard({ label, value, help }: { label: string; value: number | string; help: string }) {
  return (
    <Card>
      <div style={{ padding: 4 }}>
        <BlockStack gap="150">
          <Text as="p" tone="subdued">{label}</Text>
          <Text as="h2" variant="heading2xl">{value}</Text>
          <Text as="p" tone="subdued">{help}</Text>
        </BlockStack>
      </div>
    </Card>
  );
}

function SettingRow({ label, value, tone }: { label: string; value: string; tone?: "success" | "critical" | "attention" | "info" }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "12px 0", borderBottom: "1px solid #eef0f3" }}>
      <Text as="p">{label}</Text>
      <Badge tone={tone}>{value}</Badge>
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const width = 520;
  const height = 160;
  const max = Math.max(1, ...values);
  const points = values.map((value, index) => {
    const x = values.length === 1 ? 0 : (index / (values.length - 1)) * width;
    const y = height - (value / max) * (height - 18) - 9;
    return `${x},${y}`;
  }).join(" ");
  const area = `0,${height} ${points} ${width},${height}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="180" role="img" aria-label="30 day cart activity chart" style={{ border: "1px solid #e5e7eb", borderRadius: 14, background: "#ffffff" }}>
      {[0, 1, 2, 3].map((line) => <line key={line} x1="0" x2={width} y1={(height / 4) * line} y2={(height / 4) * line} stroke="#f1f5f9" strokeWidth="1" />)}
      <polygon points={area} fill="#eff6ff" />
      <polyline points={points} fill="none" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {values.map((value, index) => {
        const x = values.length === 1 ? 0 : (index / (values.length - 1)) * width;
        const y = height - (value / max) * (height - 18) - 9;
        return <circle key={index} cx={x} cy={y} r="3" fill="#2563eb" />;
      })}
    </svg>
  );
}

function MiniBarChart({ carts, checkouts }: { carts: number[]; checkouts: number[] }) {
  const max = Math.max(1, ...carts, ...checkouts);
  return (
    <div style={{ display: "flex", alignItems: "end", gap: 4, height: 110, padding: "12px 6px", border: "1px solid #e5e7eb", borderRadius: 14, background: "#fff" }}>
      {carts.map((cartValue, index) => (
        <div key={index} style={{ display: "flex", alignItems: "end", gap: 1, flex: 1, minWidth: 5 }} title={`Carts ${cartValue}, checkouts ${checkouts[index] || 0}`}>
          <div style={{ width: "50%", height: `${Math.max(3, (cartValue / max) * 86)}px`, background: "#2563eb", borderRadius: "4px 4px 0 0" }} />
          <div style={{ width: "50%", height: `${Math.max(3, ((checkouts[index] || 0) / max) * 86)}px`, background: "#f59e0b", borderRadius: "4px 4px 0 0" }} />
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const data = useLoaderData<typeof loader>();
  const location = useLocation();
  const search = location.search || "";
  const setting = data.setting;
  const casperSafeMode = !setting?.autoCartSyncEnabled;
  const chartValues = data.series.map((d) => d.total);
  const cartValues = data.series.map((d) => d.carts);
  const checkoutValues = data.series.map((d) => d.checkouts);

  return (
    <BlockStack gap="500">
      <section>
        <BlockStack gap="150">
          <Text as="h1" variant="headingLg">Dashboard</Text>
          <Text as="p" tone="subdued">Overview for {data.shop}. Graphs show the last 30 days of cart and checkout activity.</Text>
        </BlockStack>
      </section>

      <InlineGrid columns={{ xs: 1, sm: 2, lg: 4 }} gap="400">
        <MetricCard label="Logged-in carts pending" value={data.cartsReady} help="Saved carts waiting for reminder rules." />
        <MetricCard label="Abandoned checkouts pending" value={data.checkoutsReady} help="Checkout records not completed yet." />
        <MetricCard label="Emails sent" value={data.sentLogs} help="Successful reminder email logs." />
        <MetricCard label="Failed email logs" value={data.failedLogs} help="Email attempts that need review." />
      </InlineGrid>

      <InlineGrid columns={{ xs: 1, lg: 2 }} gap="400">
        <Card>
          <BlockStack gap="400">
            <div>
              <Text as="h2" variant="headingMd">30-day activity trend</Text>
              <Text as="p" tone="subdued">Logged-in cart captures plus abandoned checkout records.</Text>
            </div>
            <Sparkline values={chartValues} />
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <Badge tone="info">{`Logged-in carts: ${data.recentCarts}`}</Badge>
              <Badge tone="attention">{`Abandoned checkouts: ${data.recentCheckouts}`}</Badge>
            </div>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <div>
              <Text as="h2" variant="headingMd">Daily source breakdown</Text>
              <Text as="p" tone="subdued">Blue = logged-in carts, orange = abandoned checkouts.</Text>
            </div>
            <MiniBarChart carts={cartValues} checkouts={checkoutValues} />
            <Text as="p" tone="subdued">Use Cart History to expand a customer row and view all items.</Text>
          </BlockStack>
        </Card>
      </InlineGrid>

      <InlineGrid columns={{ xs: 1, lg: 2 }} gap="400">
        <Card>
          <BlockStack gap="400">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
              <div>
                <Text as="h2" variant="headingMd">Current status</Text>
                <Text as="p" tone="subdued">Main operating controls for this store.</Text>
              </div>
              <Badge tone={statusTone(setting?.isEnabled)}>{setting?.isEnabled ? "Enabled" : "Disabled"}</Badge>
            </div>
            <div>
              <SettingRow label="Logged-in cart tracking" value={setting?.loggedInCartEnabled ? "ON" : "OFF"} tone={statusTone(setting?.loggedInCartEnabled)} />
              <SettingRow label="Abandoned checkout reminder" value={setting?.abandonedCheckoutEnabled ? "ON" : "OFF"} tone={statusTone(setting?.abandonedCheckoutEnabled)} />
              <SettingRow label="Auto cart sync / merge" value={setting?.autoCartSyncEnabled ? "ON" : "OFF"} tone={setting?.autoCartSyncEnabled ? "attention" : "info"} />
              <SettingRow label="Reminder delay" value={`${setting?.daysAfter || 7} days`} tone="info" />
            </div>
            <Button url={`/app/settings${search}`} variant="primary">Open settings</Button>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <div>
              <Text as="h2" variant="headingMd">Casper transition mode</Text>
              <Text as="p" tone="subdued">Recommended while Casper is still syncing carts.</Text>
            </div>
            <div style={{ padding: 16, borderRadius: 12, background: casperSafeMode ? "#f0fdf4" : "#fff7ed", border: casperSafeMode ? "1px solid #bbf7d0" : "1px solid #fed7aa" }}>
              <BlockStack gap="200">
                <Badge tone={casperSafeMode ? "success" : "attention"}>{casperSafeMode ? "Safe for Casper parallel run" : "Auto sync is active"}</Badge>
                <Text as="p">
                  {casperSafeMode
                    ? "Auto cart sync is OFF. This app can collect cart history without changing customer carts."
                    : "Auto cart sync is ON. Use this only after Casper is disabled to avoid duplicate cart merging."}
                </Text>
              </BlockStack>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Button url={`/app/cart-history${search}`}>View cart history</Button>
              <Link to={`/app/settings${search}`} style={{ alignSelf: "center", fontWeight: 650, color: "#111827", textDecoration: "none" }}>Configure settings →</Link>
            </div>
          </BlockStack>
        </Card>
      </InlineGrid>
    </BlockStack>
  );
}
