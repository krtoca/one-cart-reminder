import type { ActionFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function normalizeCustomerIds(payload: any) {
  const ids = new Set<string>();

  const numericId = payload?.customer?.id || payload?.customer_id;
  const gid = payload?.customer?.admin_graphql_api_id;

  if (numericId) ids.add(String(numericId));
  if (gid) {
    ids.add(String(gid));
    const match = String(gid).match(/Customer\/(\d+)/);
    if (match?.[1]) ids.add(match[1]);
  }

  return Array.from(ids);
}

function orderDate(payload: any) {
  const raw = payload?.processed_at || payload?.created_at || payload?.updated_at;
  const date = raw ? new Date(raw) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export async function action({ request }: ActionFunctionArgs) {
  const { shop, payload } = await authenticate.webhook(request);

  const email = normalizeEmail(
    payload?.email ||
      payload?.contact_email ||
      payload?.customer?.email,
  );

  const customerIds = normalizeCustomerIds(payload);

  const or: any[] = [];

  if (email) {
    or.push({ customerEmail: email });
  }

  for (const customerId of customerIds) {
    or.push({ customerId });
  }

  if (!or.length) {
    console.log("orders/create cart clear skipped: no customer email/id", { shop });
    return new Response("OK");
  }

  const cleared = await prisma.customerCart.updateMany({
    where: {
      shop,
      orderedAt: null,
      OR: or,
    },
    data: {
      orderedAt: orderDate(payload),
      itemCount: 0,
      subtotal: null,
      lineItems: [],
      lastCapturedAt: new Date(),
    },
  });

  console.log("orders/create cleared active cart(s)", {
    shop,
    email,
    customerIds,
    count: cleared.count,
    orderName: payload?.name,
    orderId: payload?.id,
  });

  return new Response("OK");
}
