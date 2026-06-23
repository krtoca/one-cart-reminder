import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useLocation } from "@remix-run/react";
import { Badge, BlockStack, Button, Card, InlineGrid, Text, TextField } from "@shopify/polaris";
import { useMemo, useState } from "react";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

type LineItem = {
  productId?: string | number | null;
  variantId?: string | number | null;
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
  customerName: string | null;
  capturedAt: string;
  itemCount: number;
  total: string | null;
  currencyCode: string | null;
  url: string | null;
  items: LineItem[];
  status: string;
  reminderSentAt: string | null;
};

type ActionData = {
  ok: boolean;
  message: string;
  draftUrl?: string;
  draftName?: string;
};

function safeDays(value: string | null) {
  const parsed = Number(value || 30);
  if (!Number.isFinite(parsed)) return 30;
  return Math.min(90, Math.max(1, Math.floor(parsed)));
}

function toLineItems(value: unknown): LineItem[] {
  if (!Array.isArray(value)) return [];
  return value.map((item: any) => ({
    productId: item?.productId ?? item?.product_id ?? null,
    variantId: item?.variantId ?? item?.variant_id ?? item?.id ?? null,
    title: item?.title || "Untitled item",
    variantTitle: item?.variantTitle || item?.variant_title || null,
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

function normalizeCustomerGid(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.startsWith("gid://shopify/Customer/")) return raw;
  const numeric = raw.replace(/\D/g, "");
  if (!numeric) return null;
  return `gid://shopify/Customer/${numeric}`;
}

function normalizeVariantGid(value: string | number | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.startsWith("gid://shopify/ProductVariant/")) return raw;
  const numeric = raw.replace(/\D/g, "");
  if (!numeric) return null;
  return `gid://shopify/ProductVariant/${numeric}`;
}

function customerFallbackName(email: string | null, customerId: string | null) {
  if (email) return email.split("@")[0] || email;
  if (customerId) return `Customer ${customerId}`;
  return "Unknown customer";
}

function shopAdminHandle(shop: string) {
  return shop.replace(".myshopify.com", "");
}

async function loadCustomerNames(admin: any, rows: Array<{ customerId: string | null; email: string | null }>) {
  const ids = Array.from(
    new Set(
      rows
        .map((row) => normalizeCustomerGid(row.customerId))
        .filter(Boolean) as string[],
    ),
  ).slice(0, 100);

  const namesByGid = new Map<string, string>();

  if (!ids.length) return namesByGid;

  try {
    const response = await admin.graphql(
      `#graphql
      query CustomerNames($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Customer {
            id
            displayName
            email
            firstName
            lastName
          }
        }
      }`,
      { variables: { ids } },
    );

    const payload = await response.json();
    const nodes = payload?.data?.nodes || [];

    for (const node of nodes) {
      if (!node?.id) continue;
      const name = String(node.displayName || `${node.firstName || ""} ${node.lastName || ""}`.trim() || node.email || "").trim();
      if (name) namesByGid.set(node.id, name);
    }
  } catch (error) {
    // Customer name lookup is helpful but should not block cart history.
    console.warn("Customer name lookup skipped", error);
  }

  return namesByGid;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
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

  const baseRows: Row[] = [
    ...loggedInCarts.map((cart) => ({
      id: cart.id,
      source: "Logged-in cart" as const,
      email: cart.customerEmail,
      customerId: cart.customerId,
      customerName: null,
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
      customerName: null,
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

  const namesByGid = await loadCustomerNames(admin, baseRows);

  const rows = baseRows.map((row) => {
    const gid = normalizeCustomerGid(row.customerId);
    const customerName = gid ? namesByGid.get(gid) || null : null;
    return {
      ...row,
      customerName: customerName || customerFallbackName(row.email, row.customerId),
    };
  });

  return json({
    shop,
    days,
    rows,
    totals: { loggedInCarts: loggedInCarts.length, abandonedCheckouts: abandonedCheckouts.length, all: rows.length },
  });
}

async function findCartSource(shop: string, source: string, id: string) {
  if (source === "Logged-in cart") {
    const cart = await prisma.customerCart.findFirst({ where: { shop, id } });
    if (!cart) return null;
    return {
      source: "Logged-in cart",
      email: cart.customerEmail,
      customerId: cart.customerId,
      lineItems: toLineItems(cart.lineItems),
      note: `Created from One Cart Reminder logged-in cart. Cart ID: ${cart.id}`,
    };
  }

  if (source === "Abandoned checkout") {
    const checkout = await prisma.abandonedCheckoutReminder.findFirst({ where: { shop, id } });
    if (!checkout) return null;
    return {
      source: "Abandoned checkout",
      email: checkout.customerEmail,
      customerId: checkout.customerId,
      lineItems: toLineItems(checkout.lineItems),
      note: `Created from One Cart Reminder abandoned checkout. Checkout ID: ${checkout.abandonedCheckoutId}`,
    };
  }

  return null;
}

export async function action({ request }: ActionFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = String(formData.get("actionType") || "");
  const id = String(formData.get("id") || "");
  const source = String(formData.get("source") || "");

  if (actionType !== "createDraft") {
    return json<ActionData>({ ok: false, message: "Unsupported action." }, { status: 400 });
  }

  const cart = await findCartSource(session.shop, source, id);

  if (!cart) {
    return json<ActionData>({ ok: false, message: "Cart record was not found." }, { status: 404 });
  }

  const draftLineItems = cart.lineItems
    .map((item) => ({
      variantId: normalizeVariantGid(item.variantId),
      quantity: Math.max(1, Number(item.quantity || 0)),
    }))
    .filter((item) => item.variantId && item.quantity > 0);

  if (!draftLineItems.length) {
    return json<ActionData>({
      ok: false,
      message: "No valid Shopify variant IDs were found in this cart, so a draft order could not be created.",
    }, { status: 400 });
  }

  const customerGid = normalizeCustomerGid(cart.customerId);

  const input: any = {
    email: cart.email || undefined,
    customerId: customerGid || undefined,
    note: cart.note,
    tags: ["one-cart-reminder", source === "Logged-in cart" ? "logged-in-cart" : "abandoned-checkout"],
    lineItems: draftLineItems,
  };

  if (customerGid) {
    input.useCustomerDefaultAddress = true;
  }

  const response = await admin.graphql(
    `#graphql
    mutation CreateCartReminderDraftOrder($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder {
          id
          name
          legacyResourceId
          invoiceUrl
        }
        userErrors {
          field
          message
        }
      }
    }`,
    { variables: { input } },
  );

  const payload = await response.json();
  const result = payload?.data?.draftOrderCreate;
  const errors = result?.userErrors || [];

  if (errors.length) {
    return json<ActionData>({
      ok: false,
      message: errors.map((error: any) => error.message).join("; ") || "Draft order could not be created. Please check write_draft_orders permission.",
    }, { status: 400 });
  }

  const draft = result?.draftOrder;

  if (!draft?.id) {
    return json<ActionData>({ ok: false, message: "Shopify did not return a draft order." }, { status: 400 });
  }

  const legacyId = draft.legacyResourceId;
  const draftUrl = legacyId ? `https://admin.shopify.com/store/${shopAdminHandle(session.shop)}/draft_orders/${legacyId}` : undefined;

  if (draftUrl) {
    return redirect(draftUrl);
  }

  if (draftUrl) {
    return redirect(draftUrl);
  }

  return json<ActionData>({
    ok: true,
    message: `Draft order ${draft.name || ""} was created successfully, but the Shopify Admin URL was not available.`,
    draftName: draft.name || undefined,
    draftUrl,
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

function CartRow({ row, formAction }: { row: Row; formAction: string }) {
  return (
    <details style={{ borderBottom: "1px solid #e5e7eb" }}>
      <summary style={{ listStyle: "none", cursor: "pointer", padding: "16px 14px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1.4fr) 120px 140px 190px 130px", gap: 16, alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 750, color: "#111827" }}>{row.customerName || customerFallbackName(row.email, row.customerId)}</div>
          </div>
          <div style={{ fontWeight: 650 }}>{row.itemCount} item{row.itemCount === 1 ? "" : "s"} ▾</div>
          <div>{money(row.total, row.currencyCode)}</div>
          <div>{dateText(row.capturedAt)}</div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <span style={{ padding: "5px 9px", borderRadius: 999, background: statusClass(row.status), fontSize: 12, fontWeight: 700 }}>{row.status}</span>
          </div>
        </div>
      </summary>
      <div style={{ padding: "0 14px 16px 14px", background: "#fcfcfd" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Badge tone={row.source === "Logged-in cart" ? "info" : "attention"}>{row.source}</Badge>
            <Badge tone={statusTone(row.status)}>{row.status}</Badge>
            {row.reminderSentAt ? <Badge tone="success">{`Sent ${dateText(row.reminderSentAt)}`}</Badge> : null}
            {row.email ? <Badge tone="info">{row.email}</Badge> : null}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Form method="post" action={formAction} reloadDocument>
              <input type="hidden" name="actionType" value="createDraft" />
              <input type="hidden" name="id" value={row.id} />
              <input type="hidden" name="source" value={row.source} />
              <button
                type="submit"
                style={{
                  border: "1px solid #202223",
                  background: "#202223",
                  color: "#fff",
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Create draft order
              </button>
            </Form>
            {row.source === "Abandoned checkout" && row.url ? (
              <Button url={row.url} target="_blank">Open recovery link</Button>
            ) : null}
          </div>
        </div>
        {row.source === "Logged-in cart" ? (
          <p style={{ margin: "0 0 10px", color: "#6b7280", fontSize: 13 }}>
            Logged-in cart links are not customer recovery links. Use Create draft order for admin follow-up.
          </p>
        ) : null}
        <ItemList items={row.items} currencyCode={row.currencyCode} />
      </div>
    </details>
  );
}

export default function CartHistoryPage() {
  const { shop, days, rows, totals } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as ActionData | undefined;
  const location = useLocation();
  const formAction = `${location.pathname}${location.search}`;
  const preservedParams = new URLSearchParams(location.search);
  preservedParams.delete("days");
  const preservedEntries = Array.from(preservedParams.entries());
  const [daysValue, setDaysValue] = useState(String(days));
  const [query, setQuery] = useState("");

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const haystack = [row.customerName, row.email, row.customerId, row.source, row.status, ...row.items.flatMap((item) => [item.title, item.sku, item.variantTitle])]
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

      {actionData ? (
        <div style={{
          border: `1px solid ${actionData.ok ? "#86efac" : "#fecaca"}`,
          background: actionData.ok ? "#f0fdf4" : "#fef2f2",
          borderRadius: 12,
          padding: 14,
        }}>
          <Text as="p" fontWeight="semibold">{actionData.message}</Text>
          {actionData.draftUrl ? (
            <div style={{ marginTop: 8 }}>
              <Button url={actionData.draftUrl} target="_blank">Open draft order</Button>
            </div>
          ) : null}
        </div>
      ) : null}

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
            placeholder="Search customer name, SKU, product name, email..."
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
                {filteredRows.map((row) => <CartRow key={`${row.source}-${row.id}`} row={row} formAction={formAction} />)}
              </div>
            </div>
          )}
        </BlockStack>
      </Card>
    </BlockStack>
  );
}
