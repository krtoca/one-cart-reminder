import prisma from "../db.server";
import { normalizeShop } from "../lib/shopify-admin.server";

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
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
    return { ok: true, skipped: true, reason: "empty_cart" };
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
    lastCapturedAt: new Date(),
  };

  if (existing) {
    const updated = await prisma.customerCart.update({ where: { id: existing.id }, data });
    return { ok: true, id: updated.id, updated: true };
  }

  const created = await prisma.customerCart.create({ data });
  return { ok: true, id: created.id, created: true };
}
