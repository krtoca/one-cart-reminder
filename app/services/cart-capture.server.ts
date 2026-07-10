import prisma from "../db.server";
import { normalizeShop } from "../lib/shopify-admin.server";

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function cartLineItemsSignature(value: unknown) {
  if (!Array.isArray(value)) return "";

  return value
    .map((item: any) => {
      const variantId = String(item?.variantId || item?.variant_id || item?.id || "").replace(/\D/g, "");
      const quantity = Number(item?.quantity || 0);
      return variantId && quantity > 0 ? `${variantId}:${quantity}` : "";
    })
    .filter(Boolean)
    .sort()
    .join("|");
}

function cartLineItemsQuantityMap(value: unknown) {
  const map = new Map<string, number>();
  if (!Array.isArray(value)) return map;

  for (const item of value as any[]) {
    const key = String(
      item?.variantId ||
        item?.variant_id ||
        item?.id ||
        item?.key ||
        item?.sku ||
        item?.title ||
        "",
    ).trim();
    const quantity = Number(item?.quantity || 0);
    if (!key || !Number.isFinite(quantity) || quantity <= 0) continue;
    map.set(key, (map.get(key) || 0) + quantity);
  }

  return map;
}

function hasAddedItemOrIncreasedQuantity(previousItems: unknown, nextItems: unknown) {
  const previous = cartLineItemsQuantityMap(previousItems);
  const next = cartLineItemsQuantityMap(nextItems);

  for (const [key, quantity] of next.entries()) {
    if (quantity > (previous.get(key) || 0)) return true;
  }

  return false;
}

async function shouldSkipRecentlyClearedCart(params: {
  shop: string;
  email: string;
  customerId?: string | null;
  cartToken?: string | null;
  lineItems: any[];
}) {
  const recentCutoff = new Date(Date.now() - 30 * 60 * 1000);
  const identityOr: any[] = [{ customerEmail: params.email }];

  if (params.customerId) {
    identityOr.push({ customerId: String(params.customerId) });
  }

  const recentCleared = await prisma.customerCart.findFirst({
    where: {
      shop: params.shop,
      orderedAt: { gte: recentCutoff },
      OR: identityOr,
    },
    orderBy: { orderedAt: "desc" },
  });

  if (!recentCleared) return false;

  if (params.cartToken && recentCleared.cartToken && params.cartToken === recentCleared.cartToken) {
    return true;
  }

  const incomingSignature = cartLineItemsSignature(params.lineItems);
  const clearedSignature = cartLineItemsSignature(recentCleared.lineItems);

  return Boolean(incomingSignature && clearedSignature && incomingSignature === clearedSignature);
}

async function markActiveCartAsCleared(params: {
  shop: string;
  email: string;
  customerId?: string | null;
}) {
  const or: any[] = [{ customerEmail: params.email }];

  if (params.customerId) {
    or.push({ customerId: String(params.customerId) });
  }

  const result = await prisma.customerCart.updateMany({
    where: {
      shop: params.shop,
      orderedAt: null,
      OR: or,
    },
    data: {
      itemCount: 0,
      subtotal: null,
      lineItems: [],
      orderedAt: new Date(),
      lastCapturedAt: new Date(),
    },
  });

  return result.count;
}

async function recordEmptyCartUpdate(params: {
  shop: string;
  email: string;
  customerId?: string | null;
  cartToken?: string | null;
  cartUrl?: string | null;
  currencyCode?: string | null;
}) {
  const now = new Date();
  const or: any[] = [{ customerEmail: params.email }];

  if (params.customerId) {
    or.push({ customerId: String(params.customerId) });
  }

  const existingEmpty = await prisma.customerCart.findFirst({
    where: {
      shop: params.shop,
      itemCount: 0,
      OR: or,
    },
    orderBy: { lastCapturedAt: "desc" },
  });

  const data = {
    shop: params.shop,
    customerId: params.customerId ? String(params.customerId) : null,
    customerEmail: params.email,
    cartToken: params.cartToken ? String(params.cartToken) : null,
    cartUrl: params.cartUrl ? String(params.cartUrl) : null,
    itemCount: 0,
    subtotal: null,
    currencyCode: params.currencyCode ? String(params.currencyCode) : null,
    lineItems: [],
    orderedAt: now,
    lastCapturedAt: now,
    lastItemAddedAt: now,
  };

  if (existingEmpty) {
    return prisma.customerCart.update({ where: { id: existingEmpty.id }, data });
  }

  return prisma.customerCart.create({ data });
}

export async function captureLoggedInCustomerCart(payload: any) {
  const shop = normalizeShop(payload.shop);
  const email = normalizeEmail(payload.customerEmail);
  const token = String(payload.trackerToken || "");

  if (!shop || !email || !token) {
    throw new Error("shop, customerEmail and trackerToken are required");
  }

  const setting = await prisma.cartReminderSetting.findUnique({ where: { shop } });
  if (!setting || setting.trackerToken !== token || !setting.isEnabled || !setting.loggedInCartEnabled) {
    throw new Error("Cart tracking is not enabled for this shop or tracker token is invalid");
  }

  const lineItems = Array.isArray(payload.lineItems) ? payload.lineItems.slice(0, 50) : [];
  const itemCount = Number(payload.itemCount || lineItems.reduce((sum: number, row: any) => sum + Number(row.quantity || 0), 0));

  if (itemCount <= 0) {
    const customerId = payload.customerId ? String(payload.customerId) : null;
    const clearedCount = await markActiveCartAsCleared({
      shop,
      email,
      customerId,
    });

    const emptyRecord = await recordEmptyCartUpdate({
      shop,
      email,
      customerId,
      cartToken: payload.cartToken ? String(payload.cartToken) : null,
      cartUrl: payload.cartUrl ? String(payload.cartUrl) : setting.storefrontUrl || `https://${shop}/cart`,
      currencyCode: payload.currencyCode ? String(payload.currencyCode) : null,
    });

    return { ok: true, skipped: true, cleared: true, clearedCount, id: emptyRecord.id, reason: "empty_cart" };
  }

  const skipRecentlyCleared = await shouldSkipRecentlyClearedCart({
    shop,
    email,
    customerId: payload.customerId ? String(payload.customerId) : null,
    cartToken: payload.cartToken ? String(payload.cartToken) : null,
    lineItems,
  });

  if (skipRecentlyCleared) {
    return { ok: true, skipped: true, reason: "recently_cleared_cart" };
  }

  const existing = await prisma.customerCart.findFirst({
    where: {
      shop,
      customerEmail: email,
      reminderSentAt: null,
      orderedAt: null,
    },
    orderBy: { updatedAt: "desc" },
  });

  const now = new Date();
  const lastItemAddedAt = existing
    ? hasAddedItemOrIncreasedQuantity(existing.lineItems, lineItems) || itemCount > existing.itemCount
      ? now
      : existing.lastItemAddedAt || existing.lastCapturedAt || now
    : now;

  const data = {
    shop,
    customerId: payload.customerId ? String(payload.customerId) : null,
    customerEmail: email,
    cartToken: payload.cartToken ? String(payload.cartToken) : null,
    cartUrl: payload.cartUrl ? String(payload.cartUrl) : setting.storefrontUrl || `https://${shop}/cart`,
    itemCount,
    subtotal: payload.subtotal ? Number(payload.subtotal) : null,
    currencyCode: payload.currencyCode ? String(payload.currencyCode) : null,
    lineItems,
    lastCapturedAt: now,
    lastItemAddedAt,
  };

  if (existing) {
    const updated = await prisma.customerCart.update({ where: { id: existing.id }, data });
    return { ok: true, id: updated.id, updated: true };
  }

  const created = await prisma.customerCart.create({ data });
  return { ok: true, id: created.id, created: true };
}
