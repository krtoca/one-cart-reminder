import prisma from "../db.server";
import { normalizeShop } from "../lib/shopify-admin.server";

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function normalizeToken(value: unknown) {
  return String(value || "").trim();
}

function normalizeItems(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item: any) => ({
      variantId: String(item?.variantId || item?.variant_id || ""),
      quantity: Math.max(0, Number(item?.quantity || 0)),
    }))
    .filter((item) => item.variantId && item.quantity > 0)
    .slice(0, 50);
}

function countItems(value: unknown) {
  return normalizeItems(value).reduce((sum, item) => sum + item.quantity, 0);
}

function currentItemCountFromPayload(payload: any) {
  const explicitCount = Number(payload?.itemCount);
  if (Number.isFinite(explicitCount)) return Math.max(0, explicitCount);
  return countItems(payload?.lineItems);
}

async function findRecentClearedCart(params: {
  shop: string;
  email: string;
  customerId?: string | null;
  cartToken?: string | null;
}) {
  const recentCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const identityOr: any[] = [{ customerEmail: params.email }];

  if (params.customerId) {
    identityOr.push({ customerId: String(params.customerId) });
  }

  if (params.cartToken) {
    identityOr.push({ cartToken: String(params.cartToken) });
  }

  return prisma.customerCart.findFirst({
    where: {
      shop: params.shop,
      itemCount: 0,
      orderedAt: { gte: recentCutoff },
      OR: identityOr,
    },
    orderBy: { orderedAt: "desc" },
  });
}

async function markSavedCartAsCleared(id: string) {
  const now = new Date();

  return prisma.customerCart.update({
    where: { id },
    data: {
      itemCount: 0,
      subtotal: null,
      lineItems: [],
      orderedAt: now,
      lastCapturedAt: now,
    },
  });
}

export async function getSavedCartForAutoSync(payload: any) {
  const shop = normalizeShop(payload.shop);
  const email = normalizeEmail(payload.customerEmail);
  const token = String(payload.trackerToken || "");
  const customerId = payload.customerId ? String(payload.customerId) : null;
  const currentCartToken = normalizeToken(payload.cartToken);
  const currentItemCount = currentItemCountFromPayload(payload);

  if (!shop || !email || !token) throw new Error("shop, customerEmail and trackerToken are required");

  const setting = await prisma.cartReminderSetting.findUnique({ where: { shop } });
  if (!setting || setting.trackerToken !== token || !setting.isEnabled || !setting.loggedInCartEnabled) {
    return { ok: true, enabled: false, lineItems: [] };
  }

  // Important for Casper coexistence: tracking can be ON while auto sync remains OFF.
  if (!setting.autoCartSyncEnabled) {
    return { ok: true, enabled: false, reason: "auto_sync_disabled", lineItems: [] };
  }

  const saved = await prisma.customerCart.findFirst({
    where: { shop, customerEmail: email, reminderSentAt: null, orderedAt: null, itemCount: { gt: 0 } },
    orderBy: { lastItemAddedAt: "desc" },
  });

  if (!saved) return { ok: true, enabled: true, lineItems: [] };

  // Do not merge over an active browser cart. This prevents previously saved items
  // from being re-added after a customer manually removed one or more items.
  if (currentItemCount > 0) {
    return {
      ok: true,
      enabled: true,
      cartId: saved.id,
      reason: "current_cart_not_empty",
      lineItems: [],
    };
  }

  const recentCleared = await findRecentClearedCart({
    shop,
    email,
    customerId,
    cartToken: currentCartToken || null,
  });

  if (recentCleared) {
    return {
      ok: true,
      enabled: true,
      reason: "recently_cleared_cart",
      lineItems: [],
    };
  }

  // If the current empty cart has the same Shopify cart token as the saved cart,
  // treat it as a customer-cleared cart, not as a cart to restore.
  if (currentCartToken && saved.cartToken && currentCartToken === saved.cartToken) {
    await markSavedCartAsCleared(saved.id);
    return {
      ok: true,
      enabled: true,
      cartId: saved.id,
      reason: "same_cart_token_empty_cart_marked_cleared",
      lineItems: [],
    };
  }

  // If either cart token is missing, we cannot safely distinguish a new device
  // from a customer-cleared cart, so do not restore automatically.
  if (!currentCartToken || !saved.cartToken) {
    return {
      ok: true,
      enabled: true,
      cartId: saved.id,
      reason: "missing_cart_token_restore_blocked",
      lineItems: [],
    };
  }

  // Extra guard: if the saved cart was captured very recently, an empty cart sync
  // may be a clear/remove event that arrived before the capture endpoint finished.
  // Blocking restore here prevents the "deleted cart comes back" loop.
  const recentSavedCutoff = new Date(Date.now() - 10 * 60 * 1000);
  if (saved.lastCapturedAt >= recentSavedCutoff) {
    return {
      ok: true,
      enabled: true,
      cartId: saved.id,
      reason: "recent_saved_cart_restore_blocked",
      lineItems: [],
    };
  }

  return {
    ok: true,
    enabled: true,
    cartId: saved.id,
    reason: "restore_saved_cart_different_token",
    lineItems: normalizeItems(saved.lineItems),
  };
}
