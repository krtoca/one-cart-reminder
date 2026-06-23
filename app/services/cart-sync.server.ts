import prisma from "../db.server";
import { normalizeShop } from "../lib/shopify-admin.server";

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
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

export async function getSavedCartForAutoSync(payload: any) {
  const shop = normalizeShop(payload.shop);
  const email = normalizeEmail(payload.customerEmail);
  const token = String(payload.trackerToken || "");

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
    orderBy: { lastCapturedAt: "desc" },
  });

  if (!saved) return { ok: true, enabled: true, lineItems: [] };

  return {
    ok: true,
    enabled: true,
    cartId: saved.id,
    lineItems: normalizeItems(saved.lineItems),
  };
}
