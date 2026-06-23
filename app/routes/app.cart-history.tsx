import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, Link, useLoaderData } from "@remix-run/react";
import { Badge, BlockStack, Button, Card, InlineGrid, Layout, Page, Text, TextField } from "@shopify/polaris";
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

export default function CartHistoryPage() {
  const { shop, days, rows, totals } = useLoaderData<typeof loader>();
  const [daysValue, setDaysValue] = useState(String(days));

  return (
    <Page title="Cart history" subtitle={`${shop} · Last ${days} days`}>
      <Layout>
        <Layout.Section>
          <InlineGrid columns={{ xs: 1, md: 3 }} gap="400">
            <Card><BlockStack gap="200"><Text as="p" tone="subdued">Logged-in carts</Text><Text as="h2" variant="headingLg">{totals.loggedInCarts}</Text></BlockStack></Card>
            <Card><BlockStack gap="200"><Text as="p" tone="subdued">Abandoned checkouts</Text><Text as="h2" variant="headingLg">{totals.abandonedCheckouts}</Text></BlockStack></Card>
            <Card><BlockStack gap="200"><Text as="p" tone="subdued">Total records</Text><Text as="h2" variant="headingLg">{totals.all}</Text></BlockStack></Card>
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <Form method="get">
              <InlineGrid columns={{ xs: 1, md: 3 }} gap="300" alignItems="end">
                <TextField label="Show last N days" name="days" type="number" min={1} max={90} value={daysValue} onChange={setDaysValue} autoComplete="off" helpText="Default is 30 days. Maximum is 90 days." />
                <Button submit variant="primary">Update view</Button>
                <Text as="p" tone="subdued">Showing up to 200 records from each source.</Text>
              </InlineGrid>
            </Form>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Cart and checkout contents</Text>
              {rows.length === 0 ? (
                <Text as="p" tone="subdued">No cart or abandoned checkout records found for this period.</Text>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #ddd" }}>Date</th>
                        <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #ddd" }}>Customer</th>
                        <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #ddd" }}>Source</th>
                        <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #ddd" }}>Items</th>
                        <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #ddd" }}>Total</th>
                        <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #ddd" }}>Status</th>
                        <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #ddd" }}>Cart URL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={`${row.source}-${row.id}`}>
                          <td style={{ verticalAlign: "top", padding: "10px", borderBottom: "1px solid #eee", whiteSpace: "nowrap" }}>{dateText(row.capturedAt)}</td>
                          <td style={{ verticalAlign: "top", padding: "10px", borderBottom: "1px solid #eee" }}>
                            <BlockStack gap="100">
                              <Text as="p">{row.email}</Text>
                              {row.customerId ? <Text as="p" tone="subdued">{row.customerId}</Text> : null}
                            </BlockStack>
                          </td>
                          <td style={{ verticalAlign: "top", padding: "10px", borderBottom: "1px solid #eee" }}>{row.source}</td>
                          <td style={{ verticalAlign: "top", padding: "10px", borderBottom: "1px solid #eee", minWidth: "320px" }}>
                            <BlockStack gap="150">
                              <Text as="p" tone="subdued">{row.itemCount} item(s)</Text>
                              {row.items.map((item, index) => (
                                <div key={`${row.id}-${index}`} style={{ marginBottom: "6px" }}>
                                  <Text as="p">{item.quantity || 0} × {item.title || "Untitled item"}</Text>
                                  <Text as="p" tone="subdued">
                                    {[item.variantTitle, item.sku ? `SKU: ${item.sku}` : null, item.price ? `Price: ${money(item.price, row.currencyCode)}` : null].filter(Boolean).join(" · ")}
                                  </Text>
                                </div>
                              ))}
                            </BlockStack>
                          </td>
                          <td style={{ verticalAlign: "top", padding: "10px", borderBottom: "1px solid #eee", whiteSpace: "nowrap" }}>{money(row.total, row.currencyCode)}</td>
                          <td style={{ verticalAlign: "top", padding: "10px", borderBottom: "1px solid #eee" }}>
                            <BlockStack gap="100">
                              <Badge tone={row.status === "Not sent" ? "attention" : row.status === "Reminder sent" ? "success" : "info"}>{row.status}</Badge>
                              {row.reminderSentAt ? <Text as="p" tone="subdued">{dateText(row.reminderSentAt)}</Text> : null}
                            </BlockStack>
                          </td>
                          <td style={{ verticalAlign: "top", padding: "10px", borderBottom: "1px solid #eee" }}>
                            {row.url ? <Link to={row.url} target="_blank" rel="noopener noreferrer">Open</Link> : <Text as="p" tone="subdued">-</Text>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
