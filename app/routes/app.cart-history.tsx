import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useLoaderData, useLocation } from "@remix-run/react";
import { Badge, BlockStack, Button, Card, InlineGrid, Text, TextField } from "@shopify/polaris";
import { useMemo, useState } from "react";
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

type Row = {
  id: string;
  source: "Logged-in cart" | "Abandoned checkout";
  email: string | null;
  customerId: string | null;
  capturedAt: string;
  itemCount: number;
  total: string | null;
  currencyCode: string | null;
  url: string | null;
  items: LineItem[];
  status: string;
  reminderSentAt: string | null;
};

function safeDays(value: string | null) {
  const parsed = Number(value || 30);
  if (!Number.isFinite(parsed)) return 30;
  return Math.min(90, Math.max(1, Math.floor(parsed)));
}

function toLineItems(value: unknown): LineItem[] {
  if (!Array.isArray(value)) return [];
  return value.map((item: any) => ({
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
  return `${currencyCode || "CAD"} ${n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dateText(value: string | Date | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-CA", { timeZone: "America/Toronto" });
}

function statusTone(status: string): "attention" | "success" | "info" {
  if (status === "Not sent") return "attention";
  if (status === "Reminder sent" || status === "Ordered" || status === "Completed") return "success";
  return "info";
}

function statusClass(status: string) {
  if (status === "Not sent") return "#fff7ed";
  if (status === "Reminder sent" || status === "Ordered" || status === "Completed") return "#f0fdf4";
  return "#eff6ff";
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
      take: 500,
    }),
    prisma.abandonedCheckoutReminder.findMany({
      where: { shop, checkoutCreatedAt: { gte: since } },
      orderBy: { checkoutCreatedAt: "desc" },
      take: 500,
    }),
  ]);

  const rows: Row[] = [
    ...loggedInCarts.map((cart) => ({
      id: cart.id,
      source: "Logged-in cart" as const,
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
      source: "Abandoned checkout" as const,
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

  return json({
    shop,
    days,
    rows,
    totals: { loggedInCarts: loggedInCarts.length, abandonedCheckouts: abandonedCheckouts.length, all: rows.length },
  });
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
  return (
    <div style={{ maxHeight: 420, overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead style={{ position: "sticky", top: 0, background: "#f8fafc", zIndex: 1 }}>
          <tr>
            <th style={thStyle}>Qty</th>
            <th style={thStyle}>Product</th>
            <th style={thStyle}>SKU / Variant</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Price</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={`${item.title}-${item.sku}-${index}`} style={{ borderTop: "1px solid #edf0f2" }}>
              <td style={tdStyle}>{item.quantity || 0}</td>
              <td style={tdStyle}><strong>{item.title || "Untitled item"}</strong></td>
              <td style={tdStyle}>{[item.sku ? `SKU: ${item.sku}` : null, item.variantTitle].filter(Boolean).join(" · ") || "-"}</td>
              <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>{item.price ? money(item.price, currencyCode) : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const thStyle: React.CSSProperties = { padding: "10px 12px", textAlign: "left", fontWeight: 700, color: "#374151", borderBottom: "1px solid #e5e7eb" };
const tdStyle: React.CSSProperties = { padding: "10px 12px", verticalAlign: "top", color: "#111827" };

function CartRow({ row }: { row: Row }) {
  const preview = row.items.slice(0, 3).map((item) => `${item.quantity || 0}× ${item.title}`).join(" · ");
  const hidden = Math.max(0, row.items.length - 3);

  return (
    <details style={{ borderBottom: "1px solid #e5e7eb" }}>
      <summary style={{ listStyle: "none", cursor: "pointer", padding: "16px 14px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1.4fr) 120px 140px 190px 130px", gap: 16, alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 750, color: "#111827" }}>{row.email || "No email"}</div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{row.source}{row.customerId ? ` · ${row.customerId}` : ""}</div>
          </div>
          <div style={{ fontWeight: 650 }}>{row.itemCount} item{row.itemCount === 1 ? "" : "s"} ▾</div>
          <div>{money(row.total, row.currencyCode)}</div>
          <div>{dateText(row.capturedAt)}</div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <span style={{ padding: "5px 9px", borderRadius: 999, background: statusClass(row.status), fontSize: 12, fontWeight: 700 }}>{row.status}</span>
          </div>
        </div>
        <div style={{ marginTop: 8, color: "#6b7280", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {preview || "No item details"}{hidden ? ` · +${hidden} more` : ""}
        </div>
      </summary>
      <div style={{ padding: "0 14px 16px 14px", background: "#fcfcfd" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Badge tone={row.source === "Logged-in cart" ? "info" : "attention"}>{row.source}</Badge>
            <Badge tone={statusTone(row.status)}>{row.status}</Badge>
            {row.reminderSentAt ? <Badge tone="success">Sent {dateText(row.reminderSentAt)}</Badge> : null}
          </div>
          {row.url ? <Button url={row.url} target="_blank">Open cart / recovery link</Button> : null}
        </div>
        <ItemList items={row.items} currencyCode={row.currencyCode} />
      </div>
    </details>
  );
}

export default function CartHistoryPage() {
  const { shop, days, rows, totals } = useLoaderData<typeof loader>();
  const location = useLocation();
  const preservedParams = new URLSearchParams(location.search);
  preservedParams.delete("days");
  const preservedEntries = Array.from(preservedParams.entries());
  const [daysValue, setDaysValue] = useState(String(days));
  const [query, setQuery] = useState("");

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const haystack = [row.email, row.customerId, row.source, row.status, ...row.items.flatMap((item) => [item.title, item.sku, item.variantTitle])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [query, rows]);

  return (
    <BlockStack gap="500">
      <section>
        <BlockStack gap="150">
          <Text as="h1" variant="headingLg">Cart history</Text>
          <Text as="p" tone="subdued">{shop} · Last {days} days · click a customer row to expand cart contents</Text>
        </BlockStack>
      </section>

      <InlineGrid columns={{ xs: 1, sm: 3 }} gap="400">
        <Metric label="Logged-in carts" value={totals.loggedInCarts} help="Captured from logged-in storefront customers." />
        <Metric label="Abandoned checkouts" value={totals.abandonedCheckouts} help="Synced checkout recovery records." />
        <Metric label="Total records" value={totals.all} help="Combined cart and checkout records." />
      </InlineGrid>

      <Card>
        <Form method="get">
          <div style={{ display: "grid", gridTemplateColumns: "minmax(160px, 240px) auto 1fr", gap: 14, alignItems: "end" }}>
            {preservedEntries.map(([key, value]) => <input key={`${key}-${value}`} type="hidden" name={key} value={value} />)}
            <TextField label="Show last N days" name="days" type="number" min={1} max={90} value={daysValue} onChange={setDaysValue} autoComplete="off" helpText="Default is 30 days. Maximum is 90 days." />
            <Button submit variant="primary">Update view</Button>
            <Text as="p" tone="subdued">Showing {filteredRows.length} of {rows.length} records.</Text>
          </div>
        </Form>
      </Card>

      <Card>
        <BlockStack gap="300">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Search customers, SKU, product name, email..."
            style={{ width: "100%", padding: "12px 14px", border: "1px solid #9ca3af", borderRadius: 10, fontSize: 14 }}
          />

          {filteredRows.length === 0 ? (
            <div style={{ textAlign: "center", padding: "42px 16px" }}>
              <Text as="h2" variant="headingMd">No matching cart records</Text>
              <Text as="p" tone="subdued">Try a different search term or increase the date range.</Text>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <div style={{ minWidth: 900 }}>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1.4fr) 120px 140px 190px 130px", gap: 16, padding: "12px 14px", background: "#f8fafc", borderBottom: "1px solid #e5e7eb", fontWeight: 750, color: "#374151" }}>
                  <div>Customer</div>
                  <div>Items</div>
                  <div>Cart total</div>
                  <div>Last updated</div>
                  <div style={{ textAlign: "right" }}>Status</div>
                </div>
                {filteredRows.map((row) => <CartRow key={`${row.source}-${row.id}`} row={row} />)}
              </div>
            </div>
          )}
        </BlockStack>
      </Card>
    </BlockStack>
  );
}
