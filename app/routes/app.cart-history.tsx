import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, Link, useLoaderData, useLocation } from "@remix-run/react";
import { Badge, BlockStack, Button, Card, InlineGrid, Text, TextField } from "@shopify/polaris";
import { useState } from "react";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

type LineItem = {
  title?: string | null;
  variantTitle?: string | null;
  sku?: string | null;
  quantity?: number | string | null;
  price?: number | string | null;
  url?: string | null;
};

function safeDays(value: string | null) {
  const parsed = Number(value || 30);
  if (!Number.isFinite(parsed)) return 30;
  return Math.min(90, Math.max(1, Math.floor(parsed)));
}

function toLineItems(value: unknown): LineItem[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).map((item: any) => ({
    title: item?.title || "Untitled item",
    variantTitle: item?.variantTitle || null,
    sku: item?.sku || null,
    quantity: item?.quantity ?? 0,
    price: item?.price ?? null,
    url: item?.url || null,
  }));
}

function money(value: unknown, currencyCode?: string | null) {
  if (value === null || value === undefined || value === "") return "-";
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return `${currencyCode || ""} ${n.toFixed(2)}`.trim();
}

function dateText(value: string | Date | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-CA", { timeZone: "America/Toronto" });
}

function statusTone(status: string): "attention" | "success" | "info" {
  if (status === "Not sent") return "attention";
  if (status === "Reminder sent") return "success";
  return "info";
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const days = safeDays(url.searchParams.get("days"));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [loggedInCarts, abandonedCheckouts] = await Promise.all([
    prisma.customerCart.findMany({
      where: { shop, lastCapturedAt: { gte: since } },
      orderBy: { lastCapturedAt: "desc" },
      take: 200,
    }),
    prisma.abandonedCheckoutReminder.findMany({
      where: { shop, checkoutCreatedAt: { gte: since } },
      orderBy: { checkoutCreatedAt: "desc" },
      take: 200,
    }),
  ]);

  const rows = [
    ...loggedInCarts.map((cart) => ({
      id: cart.id,
      source: "Logged-in cart",
      email: cart.customerEmail,
      customerId: cart.customerId,
      capturedAt: cart.lastCapturedAt.toISOString(),
      itemCount: cart.itemCount,
      total: cart.subtotal ? cart.subtotal.toString() : null,
      currencyCode: cart.currencyCode,
      url: cart.cartUrl,
      items: toLineItems(cart.lineItems),
      status: cart.orderedAt ? "Ordered" : cart.reminderSentAt ? "Reminder sent" : "Not sent",
      reminderSentAt: cart.reminderSentAt?.toISOString() || null,
    })),
    ...abandonedCheckouts.map((checkout) => ({
      id: checkout.id,
      source: "Abandoned checkout",
      email: checkout.customerEmail,
      customerId: checkout.customerId,
      capturedAt: checkout.checkoutCreatedAt.toISOString(),
      itemCount: checkout.itemCount,
      total: checkout.totalPrice ? checkout.totalPrice.toString() : null,
      currencyCode: checkout.currencyCode,
      url: checkout.checkoutUrl,
      items: toLineItems(checkout.lineItems),
      status: checkout.checkoutCompletedAt ? "Completed" : checkout.reminderSentAt ? "Reminder sent" : "Not sent",
      reminderSentAt: checkout.reminderSentAt?.toISOString() || null,
    })),
  ].sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime());

  return json({ shop, days, rows, totals: { loggedInCarts: loggedInCarts.length, abandonedCheckouts: abandonedCheckouts.length, all: rows.length } });
}

function Metric({ label, value, help }: { label: string; value: number; help: string }) {
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

function ItemList({ items, currencyCode }: { items: LineItem[]; currencyCode?: string | null }) {
  const preview = items.slice(0, 6);
  const hidden = Math.max(0, items.length - preview.length);

  return (
    <BlockStack gap="200">
      {preview.map((item, index) => (
        <div key={`${item.title}-${index}`} style={{ display: "grid", gridTemplateColumns: "44px 1fr auto", gap: 12, alignItems: "start", padding: "10px 0", borderBottom: "1px solid #f1f3f5" }}>
          <div style={{ minWidth: 36, height: 28, borderRadius: 8, background: "#f3f4f6", display: "grid", placeItems: "center", fontWeight: 750, color: "#374151" }}>
            {item.quantity || 0}×
          </div>
          <div>
            <Text as="p" fontWeight="semibold">{item.title || "Untitled item"}</Text>
            <Text as="p" tone="subdued">
              {[item.variantTitle, item.sku ? `SKU: ${item.sku}` : null].filter(Boolean).join(" · ") || "No variant details"}
            </Text>
          </div>
          <Text as="p" tone="subdued">{item.price ? money(item.price, currencyCode) : "-"}</Text>
        </div>
      ))}
      {hidden > 0 ? <Text as="p" tone="subdued">+ {hidden} more item(s)</Text> : null}
    </BlockStack>
  );
}

export default function CartHistoryPage() {
  const { shop, days, rows, totals } = useLoaderData<typeof loader>();
  const location = useLocation();
  const preservedParams = new URLSearchParams(location.search);
  preservedParams.delete("days");
  const preservedEntries = Array.from(preservedParams.entries());
  const [daysValue, setDaysValue] = useState(String(days));

  return (
    <BlockStack gap="500">
      <section>
        <BlockStack gap="150">
          <Text as="h1" variant="headingLg">Cart history</Text>
          <Text as="p" tone="subdued">{shop} · Last {days} days · showing up to 200 records from each source</Text>
        </BlockStack>
      </section>

      <InlineGrid columns={{ xs: 1, sm: 3 }} gap="400">
        <Metric label="Logged-in carts" value={totals.loggedInCarts} help="Captured from logged-in storefront customers." />
        <Metric label="Abandoned checkouts" value={totals.abandonedCheckouts} help="Synced checkout recovery records." />
        <Metric label="Total records" value={totals.all} help="Combined cart and checkout records." />
      </InlineGrid>

      <Card>
        <Form method="get">
          <div style={{ display: "grid", gridTemplateColumns: "minmax(160px, 260px) auto 1fr", gap: 14, alignItems: "end" }}>
            {preservedEntries.map(([key, value]) => <input key={`${key}-${value}`} type="hidden" name={key} value={value} />)}
            <TextField label="Show last N days" name="days" type="number" min={1} max={90} value={daysValue} onChange={setDaysValue} autoComplete="off" helpText="Default is 30 days. Maximum is 90 days." />
            <Button submit variant="primary">Update view</Button>
            <Text as="p" tone="subdued">Tip: use 30 days while collecting data with Casper still running.</Text>
          </div>
        </Form>
      </Card>

      {rows.length === 0 ? (
        <Card>
          <div style={{ textAlign: "center", padding: "42px 16px" }}>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">No cart records yet</Text>
              <Text as="p" tone="subdued">Enable the Theme App Embed, log in as a storefront customer, add products to cart, then refresh this page.</Text>
            </BlockStack>
          </div>
        </Card>
      ) : (
        <BlockStack gap="350">
          {rows.map((row) => (
            <Card key={`${row.source}-${row.id}`}>
              <BlockStack gap="400">
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div style={{ minWidth: 260 }}>
                    <BlockStack gap="100">
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <Badge tone={row.source === "Logged-in cart" ? "info" : "attention"}>{row.source}</Badge>
                        <Badge tone={statusTone(row.status)}>{row.status}</Badge>
                      </div>
                      <Text as="h2" variant="headingMd">{row.email}</Text>
                      <Text as="p" tone="subdued">{dateText(row.capturedAt)}{row.customerId ? ` · ${row.customerId}` : ""}</Text>
                    </BlockStack>
                  </div>
                  <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ textAlign: "right" }}>
                      <Text as="p" tone="subdued">Items</Text>
                      <Text as="p" fontWeight="semibold">{row.itemCount}</Text>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <Text as="p" tone="subdued">Total</Text>
                      <Text as="p" fontWeight="semibold">{money(row.total, row.currencyCode)}</Text>
                    </div>
                    {row.url ? <Button url={row.url} target="_blank">Open cart</Button> : null}
                  </div>
                </div>

                <div style={{ border: "1px solid #edf0f2", borderRadius: 12, padding: "6px 14px", background: "#fcfcfd" }}>
                  <ItemList items={row.items} currencyCode={row.currencyCode} />
                </div>

                {row.reminderSentAt ? <Text as="p" tone="subdued">Reminder sent: {dateText(row.reminderSentAt)}</Text> : null}
                {row.url ? <Link to={row.url} target="_blank" rel="noopener noreferrer" style={{ color: "#111827", fontWeight: 650, textDecoration: "none" }}>Open saved cart / recovery link →</Link> : null}
              </BlockStack>
            </Card>
          ))}
        </BlockStack>
      )}
    </BlockStack>
  );
}
