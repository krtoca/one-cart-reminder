import type { LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData, useLocation } from "@remix-run/react";
import { Badge, BlockStack, Button, Card, InlineGrid, Text } from "@shopify/polaris";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

function statusTone(value: boolean | undefined) {
  return value ? "success" : "critical";
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const [setting, cartsReady, checkoutsReady, sentLogs, failedLogs, recentCarts, recentCheckouts] = await Promise.all([
    prisma.cartReminderSetting.findUnique({ where: { shop } }),
    prisma.customerCart.count({ where: { shop, reminderSentAt: null, orderedAt: null } }),
    prisma.abandonedCheckoutReminder.count({ where: { shop, reminderSentAt: null, checkoutCompletedAt: null } }),
    prisma.reminderEmailLog.count({ where: { shop, ok: true } }),
    prisma.reminderEmailLog.count({ where: { shop, ok: false } }),
    prisma.customerCart.count({ where: { shop, lastCapturedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } }),
    prisma.abandonedCheckoutReminder.count({ where: { shop, checkoutCreatedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } }),
  ]);
  return { shop, setting, cartsReady, checkoutsReady, sentLogs, failedLogs, recentCarts, recentCheckouts };
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

export default function Dashboard() {
  const data = useLoaderData<typeof loader>();
  const location = useLocation();
  const search = location.search || "";
  const setting = data.setting;
  const casperSafeMode = !setting?.autoCartSyncEnabled;

  return (
    <BlockStack gap="500">
      <section>
        <BlockStack gap="150">
          <Text as="h1" variant="headingLg">Dashboard</Text>
          <Text as="p" tone="subdued">Overview for {data.shop}</Text>
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
                    : "Auto cart sync is ON. Use this after Casper is disabled to avoid duplicate cart merging."}
                </Text>
              </BlockStack>
            </div>
            <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
              <MetricCard label="30-day carts" value={data.recentCarts} help="Logged-in cart captures." />
              <MetricCard label="30-day checkouts" value={data.recentCheckouts} help="Abandoned checkout records." />
            </InlineGrid>
          </BlockStack>
        </Card>
      </InlineGrid>

      <Card>
        <BlockStack gap="400">
          <Text as="h2" variant="headingMd">Next steps</Text>
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ padding: 14, border: "1px solid #e5e7eb", borderRadius: 12, background: "#ffffff" }}>
              <Text as="p"><strong>1. Theme App Embed</strong> — Turn on Cart Reminder Tracker in Online Store → Themes → Customize → App embeds.</Text>
            </div>
            <div style={{ padding: 14, border: "1px solid #e5e7eb", borderRadius: 12, background: "#ffffff" }}>
              <Text as="p"><strong>2. Confirm cart capture</strong> — Log in as a storefront customer, add items to cart, then check Cart History.</Text>
            </div>
            <div style={{ padding: 14, border: "1px solid #e5e7eb", borderRadius: 12, background: "#ffffff" }}>
              <Text as="p"><strong>3. Reminder emails</strong> — Keep email reminders OFF until the history data looks correct.</Text>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Button url={`/app/cart-history${search}`}>View cart history</Button>
            <Link to={`/app/settings${search}`} style={{ alignSelf: "center", fontWeight: 650, color: "#111827", textDecoration: "none" }}>Configure tracker token →</Link>
          </div>
        </BlockStack>
      </Card>
    </BlockStack>
  );
}
