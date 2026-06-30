import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useLocation } from "@remix-run/react";
import { Badge, BlockStack, Button, Card, InlineGrid, Text, TextField } from "@shopify/polaris";
import { useEffect, useMemo, useState } from "react";
import prisma from "../db.server";
import { syncAbandonedCheckoutsForShop } from "../services/abandoned-checkout.server";
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
  orderTotal: number | null;
  lastOrderDate: string | null;
  lastOrderName: string | null;
  capturedAt: string;
  itemCount: number;
  total: string | null;
  currencyCode: string | null;
  url: string | null;
  cartToken: string | null;
  totalSource: string;
  items: LineItem[];
  status: string;
  reminderSentAt: string | null;
};

type ActionData = {
  ok: boolean;
  message: string;
  draftUrl?: string;
  draftName?: string;
  redirectToDraft?: boolean;
  debug?: string;
};

function parseCookie(header: string | null, key: string) {
  const cookies = String(header || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);

  for (const cookie of cookies) {
    const [name, ...rest] = cookie.split("=");
    if (name === key) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function safeDays(value: string | null | undefined) {
  const parsed = Number(value || 30);
  if (!Number.isFinite(parsed)) return 30;
  return Math.min(90, Math.max(1, Math.floor(parsed)));
}

function toLineItems(value: unknown): LineItem[] {
  if (!Array.isArray(value)) return [];
  return value.map((item: any) => ({
    productId: item?.productId ?? item?.product_id ?? null,
    variantId: item?.variantId ?? item?.variant_id ?? item?.variant?.id ?? item?.id ?? null,
    title: item?.title || "Untitled item",
    variantTitle: item?.variantTitle || item?.variant_title || item?.variant?.title || null,
    sku: item?.sku || item?.variant?.sku || null,
    quantity: item?.quantity ?? 0,
    price: item?.price ?? item?.unitPrice ?? null,
    url: item?.url || null,
  }));
}

function money(value: unknown, currencyCode?: string | null) {
  if (value === null || value === undefined || value === "") return "-";
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return `${currencyCode || "CAD"} ${n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function lineItemsTotal(items: LineItem[]) {
  const total = items.reduce((sum, item) => {
    const quantity = Number(item.quantity || 0);
    const price = Number(item.price || 0);
    return Number.isFinite(quantity) && Number.isFinite(price) ? sum + quantity * price : sum;
  }, 0);

  return Number(total.toFixed(2));
}

function rowAmount(row: Pick<Row, "total" | "items">) {
  const direct = Number(row.total || 0);
  if (Number.isFinite(direct) && direct > 0) return direct;
  return lineItemsTotal(row.items || []);
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
  if (status === "Empty/Cleared") return "#f3f4f6";
  return "#eff6ff";
}

function cartStatus(cart: { itemCount: number; orderedAt: Date | null; reminderSentAt: Date | null }) {
  if (cart.itemCount <= 0) return "Empty/Cleared";
  if (cart.orderedAt) return "Ordered";
  return cart.reminderSentAt ? "Reminder sent" : "Not sent";
}

function checkoutStatus(checkout: { checkoutCompletedAt: Date | null; reminderSentAt: Date | null }) {
  if (checkout.checkoutCompletedAt) return "Completed";
  return checkout.reminderSentAt ? "Reminder sent" : "Not sent";
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

function trimDebug(value: unknown) {
  try {
    return JSON.stringify(value, null, 2).slice(0, 2000);
  } catch {
    return String(value).slice(0, 2000);
  }
}

function sumMoney(rows: Row[]) {
  return rows.reduce((sum, row) => {
    const value = rowAmount(row);
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);
}

async function loadCustomerInfo(admin: any, rows: Array<{ customerId: string | null; email: string | null }>) {
  const ids = Array.from(
    new Set(
      rows
        .map((row) => normalizeCustomerGid(row.customerId))
        .filter(Boolean) as string[],
    ),
  ).slice(0, 100);

  const infoByGid = new Map<string, { name: string | null; orderTotal: number | null; lastOrderDate: string | null; lastOrderName: string | null }>();

  if (!ids.length) return infoByGid;

  try {
    const response = await admin.graphql(
      `#graphql
      query CustomerCartInfo($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Customer {
            id
            displayName
            email
            firstName
            lastName
            numberOfOrders
            orders(first: 1, sortKey: PROCESSED_AT, reverse: true) {
              nodes {
                name
                processedAt
                createdAt
              }
            }
          }
        }
      }`,
      { variables: { ids } },
    );

    const payload = await response.json();

    if (payload?.errors?.length) {
      console.warn("Customer order lookup GraphQL errors", payload.errors);
      return infoByGid;
    }

    const nodes = payload?.data?.nodes || [];

    for (const node of nodes) {
      if (!node?.id) continue;
      const name = String(node.displayName || `${node.firstName || ""} ${node.lastName || ""}`.trim() || node.email || "").trim();
      const lastOrder = node.orders?.nodes?.[0] || null;
      infoByGid.set(node.id, {
        name: name || null,
        orderTotal: Number.isFinite(Number(node.numberOfOrders)) ? Number(node.numberOfOrders) : null,
        lastOrderDate: lastOrder?.processedAt || lastOrder?.createdAt || null,
        lastOrderName: lastOrder?.name || null,
      });
    }
  } catch (error) {
    console.warn("Customer/order lookup skipped", error);
  }

  return infoByGid;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const queryDays = url.searchParams.get("days");
  const cookieDays = parseCookie(request.headers.get("Cookie"), "cart_history_days");
  const days = safeDays(queryDays || cookieDays);
  const view = url.searchParams.get("view") === "all" ? "all" : "active";
  const showEmptyUpdates = view === "all" && url.searchParams.get("showEmpty") === "1";
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const loggedInWhere: any = { shop, lastCapturedAt: { gte: since } };

  if (view === "active") {
    loggedInWhere.orderedAt = null;
    loggedInWhere.itemCount = { gt: 0 };
  } else if (!showEmptyUpdates) {
    loggedInWhere.itemCount = { gt: 0 };
  }

  const abandonedWhere: any = { shop, checkoutUpdatedAt: { gte: since } };

  if (view === "active") {
    abandonedWhere.checkoutCompletedAt = null;
  }

  const [loggedInCarts, abandonedCheckouts] = await Promise.all([
    prisma.customerCart.findMany({
      where: loggedInWhere,
      orderBy: { lastCapturedAt: "desc" },
      take: 1000,
    }),
    prisma.abandonedCheckoutReminder.findMany({
      where: abandonedWhere,
      orderBy: { checkoutUpdatedAt: "desc" },
      take: 1000,
    }),
  ]);

  const baseRows: Row[] = [
    ...loggedInCarts.map((cart) => ({
      id: cart.id,
      source: "Logged-in cart" as const,
      email: cart.customerEmail,
      customerId: cart.customerId,
      customerName: null,
      orderTotal: null,
      lastOrderDate: null,
      lastOrderName: null,
      capturedAt: cart.lastCapturedAt.toISOString(),
      itemCount: cart.itemCount,
      total: cart.subtotal ? cart.subtotal.toString() : null,
      currencyCode: cart.currencyCode,
      url: cart.cartUrl,
      cartToken: cart.cartToken,
      totalSource: cart.subtotal ? "Captured cart subtotal" : "No subtotal captured",
      items: toLineItems(cart.lineItems),
      status: cartStatus(cart),
      reminderSentAt: cart.reminderSentAt?.toISOString() || null,
    })),
    ...abandonedCheckouts.map((checkout) => ({
      id: checkout.id,
      source: "Abandoned checkout" as const,
      email: checkout.customerEmail,
      customerId: checkout.customerId,
      customerName: null,
      orderTotal: null,
      lastOrderDate: null,
      lastOrderName: null,
      capturedAt: checkout.checkoutUpdatedAt?.toISOString?.() || checkout.checkoutCreatedAt.toISOString(),
      itemCount: checkout.itemCount,
      total: checkout.totalPrice && Number(checkout.totalPrice) > 0 ? checkout.totalPrice.toString() : String(lineItemsTotal(toLineItems(checkout.lineItems)) || ""),
      currencyCode: checkout.currencyCode,
      url: checkout.checkoutUrl,
      cartToken: null,
      totalSource: checkout.totalPrice && Number(checkout.totalPrice) > 0 ? "Shopify abandoned checkout total" : "Line item fallback total",
      items: toLineItems(checkout.lineItems),
      status: checkoutStatus(checkout),
      reminderSentAt: checkout.reminderSentAt?.toISOString() || null,
    })),
  ].sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime());

  const infoByGid = await loadCustomerInfo(admin, baseRows);

  const rows = baseRows.map((row) => {
    const gid = normalizeCustomerGid(row.customerId);
    const customerInfo = gid ? infoByGid.get(gid) || null : null;
    return {
      ...row,
      customerName: customerInfo?.name || customerFallbackName(row.email, row.customerId),
      orderTotal: customerInfo?.orderTotal ?? null,
      lastOrderDate: customerInfo?.lastOrderDate ?? null,
      lastOrderName: customerInfo?.lastOrderName ?? null,
    };
  });

  const loggedInRows = rows.filter((row) => row.source === "Logged-in cart");
  const activeLoggedInRows = loggedInRows.filter((row) => row.itemCount > 0 && row.status !== "Empty/Cleared" && row.status !== "Ordered");
  const emptyLoggedInRows = loggedInRows.filter((row) => row.itemCount <= 0 || row.status === "Empty/Cleared");
  const abandonedRows = rows.filter((row) => row.source === "Abandoned checkout");
  const currencyCode = rows.find((row) => row.currencyCode)?.currencyCode || "CAD";

  const headers = new Headers();
  if (queryDays) {
    headers.append("Set-Cookie", `cart_history_days=${days}; Path=/app/cart-history; Max-Age=7776000; SameSite=Lax`);
  }

  return json(
    {
      shop,
      days,
      view,
      showEmptyUpdates,
      rows,
      totals: {
        loggedInCarts: loggedInRows.length,
        activeLoggedInCarts: activeLoggedInRows.length,
        emptyLoggedInCarts: emptyLoggedInRows.length,
        abandonedCheckouts: abandonedRows.length,
        all: rows.length,
        activeCartAmount: sumMoney(activeLoggedInRows),
        abandonedAmount: sumMoney(abandonedRows),
        totalAmount: sumMoney(rows),
        currencyCode,
      },
    },
    { headers },
  );
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

function draftLineItemFromCartItem(item: LineItem) {
  const quantity = Math.max(1, Number(item.quantity || 0));
  const variantId = normalizeVariantGid(item.variantId);

  if (variantId) {
    return { variantId, quantity };
  }

  const price = Number(item.price || 0);
  return {
    title: item.title || "Untitled item",
    quantity,
    originalUnitPrice: Number.isFinite(price) && price > 0 ? price.toFixed(2) : "0.00",
    requiresShipping: true,
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = String(formData.get("actionType") || "");
  const id = String(formData.get("id") || "");
  const source = String(formData.get("source") || "");
  const returnTo = String(formData.get("returnTo") || "/app/cart-history");

  if (actionType === "syncAbandoned") {
    try {
      const result = await syncAbandonedCheckoutsForShop(session.shop, new Date());
      const url = new URL(returnTo, "https://local.invalid");
      url.searchParams.set("synced", String(result.synced || 0));
      return redirect(`${url.pathname}${url.search}`);
    } catch (error: any) {
      return json<ActionData>({ ok: false, message: "Abandoned checkout sync failed.", debug: String(error?.message || error) }, { status: 500 });
    }
  }

  if (actionType === "clearCart") {
    if (source !== "Logged-in cart") {
      return json<ActionData>({ ok: false, message: "Only logged-in carts can be cleared manually." }, { status: 400 });
    }

    await prisma.customerCart.updateMany({
      where: { shop: session.shop, id, orderedAt: null },
      data: {
        itemCount: 0,
        subtotal: null,
        lineItems: [],
        orderedAt: new Date(),
        lastCapturedAt: new Date(),
      },
    });

    return redirect(returnTo);
  }

  if (actionType !== "createDraft") {
    return json<ActionData>({ ok: false, message: "Unsupported action." }, { status: 400 });
  }

  const cart = await findCartSource(session.shop, source, id);

  if (!cart) {
    return json<ActionData>({ ok: false, message: "Cart record was not found." }, { status: 404 });
  }

  const draftLineItems = cart.lineItems
    .map(draftLineItemFromCartItem)
    .filter((item: any) => Number(item.quantity || 0) > 0);

  if (!draftLineItems.length) {
    return json<ActionData>({ ok: false, message: "No line items were found, so a draft order could not be created." }, { status: 400 });
  }

  const customerGid = normalizeCustomerGid(cart.customerId);
  const input: any = {
    email: cart.email || undefined,
    customerId: customerGid || undefined,
    note: cart.note,
    tags: ["one-cart-reminder", source === "Logged-in cart" ? "logged-in-cart" : "abandoned-checkout"],
    lineItems: draftLineItems,
  };

  if (customerGid) input.useCustomerDefaultAddress = true;

  let payload: any;

  try {
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

    payload = await response.json();
  } catch (error: any) {
    console.error("Draft order GraphQL request failed", error);
    return json<ActionData>({ ok: false, message: "Draft order request failed before Shopify returned a result.", debug: error?.message || String(error) }, { status: 500 });
  }

  if (payload?.errors?.length) {
    console.error("Draft order GraphQL errors", payload.errors);
    return json<ActionData>({ ok: false, message: payload.errors.map((error: any) => error.message).join("; ") || "Shopify GraphQL error.", debug: trimDebug(payload.errors) }, { status: 400 });
  }

  const result = payload?.data?.draftOrderCreate;
  const errors = result?.userErrors || [];

  if (errors.length) {
    console.error("Draft order userErrors", errors);
    return json<ActionData>({ ok: false, message: errors.map((error: any) => error.message).join("; ") || "Draft order could not be created.", debug: trimDebug(errors) }, { status: 400 });
  }

  const draft = result?.draftOrder;
  if (!draft?.id) {
    console.error("Draft order missing in response", payload);
    return json<ActionData>({ ok: false, message: "Shopify did not return a draft order.", debug: trimDebug(payload) }, { status: 400 });
  }

  const legacyId = draft.legacyResourceId;
  const draftUrl = legacyId ? `https://admin.shopify.com/store/${shopAdminHandle(session.shop)}/draft_orders/${legacyId}` : undefined;

  return json<ActionData>({
    ok: true,
    message: `Draft order ${draft.name || ""} was created successfully.`,
    draftName: draft.name || undefined,
    draftUrl,
    redirectToDraft: Boolean(draftUrl),
  });
}

function Metric({ label, value, help }: { label: string; value: string | number; help: string }) {
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

const thStyle = { padding: "10px 12px", textAlign: "left" as const, fontWeight: 700, color: "#374151", borderBottom: "1px solid #e5e7eb" };
const tdStyle = { padding: "10px 12px", verticalAlign: "top" as const, color: "#111827" };
const rowGridColumns = "minmax(220px, 1.4fr) 110px 130px 170px 130px 170px 120px";

function CartRow({ row, formAction, currentPath }: { row: Row; formAction: string; currentPath: string }) {
  return (
    <details style={{ borderBottom: "1px solid #e5e7eb" }}>
      <summary style={{ listStyle: "none", cursor: "pointer", padding: "16px 14px" }}>
        <div style={{ display: "grid", gridTemplateColumns: rowGridColumns, gap: 16, alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 750, color: "#111827" }}>{row.customerName || customerFallbackName(row.email, row.customerId)}</div>
          </div>
          <div style={{ fontWeight: 650 }}>{row.itemCount} item{row.itemCount === 1 ? "" : "s"} ▾</div>
          <div>{money(row.total, row.currencyCode)}</div>
          <div>{dateText(row.capturedAt)}</div>
          <div>{row.orderTotal === null ? "-" : `${row.orderTotal} order${row.orderTotal === 1 ? "" : "s"}`}</div>
          <div>{row.lastOrderDate ? `${row.lastOrderName || ""} ${dateText(row.lastOrderDate)}`.trim() : "-"}</div>
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
            {row.orderTotal !== null ? <Badge tone="info">{`${row.orderTotal} lifetime order${row.orderTotal === 1 ? "" : "s"}`}</Badge> : null}
            {row.lastOrderDate ? <Badge tone="success">{`Last order: ${row.lastOrderName || ""} ${dateText(row.lastOrderDate)}`}</Badge> : null}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {row.itemCount > 0 ? (
              <Form method="post" action={formAction}>
                <input type="hidden" name="actionType" value="createDraft" />
                <input type="hidden" name="id" value={row.id} />
                <input type="hidden" name="source" value={row.source} />
                <input type="hidden" name="returnTo" value={currentPath} />
                <button type="submit" style={primaryButtonStyle}>Create draft order</button>
              </Form>
            ) : (
              <span style={{ ...secondaryButtonStyle, cursor: "default", color: "#6b7280" }}>Empty cart</span>
            )}
            {row.source === "Logged-in cart" && row.itemCount > 0 ? (
              <Form method="post" action={formAction}>
                <input type="hidden" name="actionType" value="clearCart" />
                <input type="hidden" name="id" value={row.id} />
                <input type="hidden" name="source" value={row.source} />
                <input type="hidden" name="returnTo" value={currentPath} />
                <button
                  type="submit"
                  style={secondaryButtonStyle}
                  onClick={(event) => {
                    if (!window.confirm("Clear this cart from active history?")) event.preventDefault();
                  }}
                >
                  Clear cart
                </button>
              </Form>
            ) : null}
          </div>
        </div>
        {row.source === "Logged-in cart" ? (
          <p style={{ margin: "0 0 10px", color: "#6b7280", fontSize: 13 }}>
            Logged-in cart links are not customer recovery links. Use Create draft order for admin follow-up.
          </p>
        ) : null}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8, marginBottom: 12, padding: 12, border: "1px solid #e5e7eb", borderRadius: 10, background: "#fff", fontSize: 12, color: "#4b5563" }}>
          <div><strong>Customer ID:</strong> {row.customerId || "-"}</div>
          <div><strong>Cart token:</strong> {row.cartToken || "-"}</div>
          <div><strong>Captured at:</strong> {dateText(row.capturedAt)}</div>
          <div><strong>Item count:</strong> {row.itemCount}</div>
          <div><strong>Total source:</strong> {row.totalSource}</div>
          <div><strong>Record ID:</strong> {row.id}</div>
        </div>
        <ItemList items={row.items} currencyCode={row.currencyCode} />
      </div>
    </details>
  );
}

const primaryButtonStyle = {
  border: "1px solid #202223",
  background: "#202223",
  color: "#fff",
  borderRadius: 8,
  padding: "8px 12px",
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryButtonStyle = {
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#374151",
  borderRadius: 8,
  padding: "8px 12px",
  fontWeight: 700,
  cursor: "pointer",
};

const pillStyle = {
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#374151",
  borderRadius: 999,
  padding: "7px 12px",
  fontWeight: 700,
  textDecoration: "none",
  display: "inline-flex",
};

const activePillStyle = {
  ...pillStyle,
  border: "1px solid #202223",
  background: "#202223",
  color: "#fff",
};

export default function CartHistoryPage() {
  const { shop, days, view, showEmptyUpdates, rows, totals } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as ActionData | undefined;
  const location = useLocation();
  const currentPath = `${location.pathname}${location.search}`;
  const preservedParams = new URLSearchParams(location.search);
  preservedParams.delete("days");
  preservedParams.delete("_data");
  const preservedEntries = Array.from(preservedParams.entries());
  const [daysValue, setDaysValue] = useState(String(days));
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const formAction = `${location.pathname}${location.search}`;
  const synced = new URLSearchParams(location.search).get("synced");

  function pathWithParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(location.search);
    params.delete("_data");
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null) params.delete(key);
      else params.set(key, value);
    });
    const search = params.toString();
    return search ? `${location.pathname}?${search}` : location.pathname;
  }

  useEffect(() => {
    setDaysValue(String(days));
  }, [days]);

  useEffect(() => {
    setPage(1);
  }, [view, showEmptyUpdates]);

  useEffect(() => {
    if (!actionData?.ok || !actionData.redirectToDraft || !actionData.draftUrl) return;
    const timer = window.setTimeout(() => {
      window.open(actionData.draftUrl, "_top");
    }, 250);
    return () => window.clearTimeout(timer);
  }, [actionData]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const haystack = [row.customerName, row.email, row.customerId, row.source, row.status, row.lastOrderName, ...row.items.flatMap((item) => [item.title, item.sku, item.variantTitle])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [query, rows]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedRows = filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize);

  function updateDays() {
    const params = new URLSearchParams(location.search);
    params.set("days", String(safeDays(daysValue)));
    params.delete("_data");
    window.location.href = `${location.pathname}?${params.toString()}`;
  }

  return (
    <BlockStack gap="500">
      <section>
        <BlockStack gap="150">
          <Text as="h1" variant="headingLg">Cart history</Text>
          <Text as="p" tone="subdued">{shop} · Last {days} days · {view === "active" ? "Active carts only" : "All updates"} · click a customer row to expand cart contents</Text>
        </BlockStack>
      </section>

      {synced !== null ? (
        <div style={{ border: "1px solid #bfdbfe", background: "#eff6ff", borderRadius: 12, padding: 14 }}>
          <Text as="p" fontWeight="semibold">Abandoned checkout sync completed. Synced {synced} record(s).</Text>
        </div>
      ) : null}

      {actionData ? (
        <div style={{
          border: `1px solid ${actionData.ok ? "#86efac" : "#fecaca"}`,
          background: actionData.ok ? "#f0fdf4" : "#fef2f2",
          borderRadius: 12,
          padding: 14,
        }}>
          <Text as="p" fontWeight="semibold">{actionData.message}</Text>
          {actionData.debug ? <pre style={{ whiteSpace: "pre-wrap", marginTop: 10, color: "#374151", fontSize: 12 }}>{actionData.debug}</pre> : null}
          {actionData.draftUrl ? (
            <div style={{ marginTop: 8 }}>
              <Button url={actionData.draftUrl} target="_top">Open draft order</Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <Card>
        <BlockStack gap="200">
          <Text as="h2" variant="headingMd">Cart Reminder / Casper comparison note</Text>
          <Text as="p" tone="subdued">Active carts shows non-empty logged-in carts that are still available for reminder follow-up. All updates can include empty or cleared cart updates, which is closer to Casper-style history. Data is collected only after this tracker was enabled.</Text>
        </BlockStack>
      </Card>

      <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="400">
        <Metric label="Active cart amount" value={money(totals.activeCartAmount, totals.currencyCode)} help="Total amount currently sitting in active non-empty logged-in customer carts." />
        <Metric label="Abandoned amount" value={money(totals.abandonedAmount, totals.currencyCode)} help="Total amount from synced abandoned checkouts." />
        <Metric label="Combined amount" value={money(totals.totalAmount, totals.currencyCode)} help="Logged-in carts plus abandoned checkouts in this view." />
      </InlineGrid>

      <InlineGrid columns={{ xs: 1, sm: 3 }} gap="400">
        <Metric label="Logged-in records" value={totals.loggedInCarts} help={`${totals.activeLoggedInCarts} active · ${totals.emptyLoggedInCarts} empty/cleared`} />
        <Metric label="Abandoned checkouts" value={totals.abandonedCheckouts} help="Synced checkout recovery records in this view." />
        <Metric label="Total records" value={totals.all} help="Combined cart and checkout records in this view." />
      </InlineGrid>

      <Card>
        <BlockStack gap="300">
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <a href={pathWithParams({ view: "active", showEmpty: null })} style={view === "active" ? activePillStyle : pillStyle}>Active carts</a>
            <a href={pathWithParams({ view: "all" })} style={view === "all" ? activePillStyle : pillStyle}>All updates</a>
            <label style={{ display: "flex", gap: 7, alignItems: "center", color: view === "all" ? "#111827" : "#9ca3af", fontSize: 13, fontWeight: 650 }}>
              <input
                type="checkbox"
                checked={showEmptyUpdates}
                disabled={view !== "all"}
                onChange={(event) => {
                  window.location.href = pathWithParams({ view: "all", showEmpty: event.currentTarget.checked ? "1" : null });
                }}
              />
              Show empty carts
            </label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(160px, 240px) auto auto 1fr", gap: 14, alignItems: "end" }}>
            {preservedEntries.map(([key, value]) => <input key={`${key}-${value}`} type="hidden" name={key} value={value} />)}
            <TextField label="Show last N days" name="days" type="number" min={1} max={90} value={daysValue} onChange={setDaysValue} autoComplete="off" helpText="Saved in browser cookie. Maximum is 90 days." />
            <button type="button" onClick={updateDays} style={{ ...primaryButtonStyle, height: 38 }}>Update view</button>
            <Form method="post" action={formAction}>
              <input type="hidden" name="actionType" value="syncAbandoned" />
              <input type="hidden" name="returnTo" value={currentPath} />
              <button type="submit" style={{ ...secondaryButtonStyle, height: 38 }}>Sync abandoned</button>
            </Form>
            <Text as="p" tone="subdued">Showing {filteredRows.length} of {rows.length} records.</Text>
          </div>
          <Text as="p" tone="subdued">Use Sync abandoned if abandoned checkouts are not showing yet. Active carts is the reminder target view. All updates is mainly for Casper comparison and troubleshooting.</Text>
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="300">
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              setPage(1);
            }}
            placeholder="Search customer name, SKU, product name, email..."
            style={{ width: "100%", padding: "12px 14px", border: "1px solid #9ca3af", borderRadius: 10, fontSize: 14 }}
          />

          {filteredRows.length === 0 ? (
            <div style={{ textAlign: "center", padding: "42px 16px" }}>
              <Text as="h2" variant="headingMd">No matching cart records</Text>
              <Text as="p" tone="subdued">Try a different search term, increase the date range, or click Sync abandoned.</Text>
            </div>
          ) : (
            <div>
              <div style={{ overflowX: "auto" }}>
                <div style={{ minWidth: 1220 }}>
                  <div style={{ display: "grid", gridTemplateColumns: rowGridColumns, gap: 16, padding: "12px 14px", background: "#f8fafc", borderBottom: "1px solid #e5e7eb", fontWeight: 750, color: "#374151" }}>
                    <div>Customer</div>
                    <div>Items</div>
                    <div>Cart total</div>
                    <div>Last updated</div>
                    <div>Order total</div>
                    <div>Last order date</div>
                    <div style={{ textAlign: "right" }}>Status</div>
                  </div>
                  {paginatedRows.map((row) => (
                    <CartRow key={`${row.source}-${row.id}`} row={row} formAction={formAction} currentPath={currentPath} />
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 14 }}>
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  style={{
                    ...secondaryButtonStyle,
                    background: safePage <= 1 ? "#f3f4f6" : "#fff",
                    color: safePage <= 1 ? "#9ca3af" : "#111827",
                    cursor: safePage <= 1 ? "not-allowed" : "pointer",
                  }}
                >
                  Previous
                </button>

                <Text as="p" tone="subdued">
                  Page {safePage} of {totalPages} · Showing {paginatedRows.length} of {filteredRows.length}
                </Text>

                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  style={{
                    ...secondaryButtonStyle,
                    background: safePage >= totalPages ? "#f3f4f6" : "#fff",
                    color: safePage >= totalPages ? "#9ca3af" : "#111827",
                    cursor: safePage >= totalPages ? "not-allowed" : "pointer",
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </BlockStack>
      </Card>
    </BlockStack>
  );
}
