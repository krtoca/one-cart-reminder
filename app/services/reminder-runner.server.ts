import prisma from "../db.server";
import { sendReminderEmail } from "../lib/email.server";
import { customerHasOrderSince } from "./order-check.server";
import { renderReminderEmail } from "./reminder-email-template.server";
import { syncAbandonedCheckoutsForShop } from "./abandoned-checkout.server";

function daysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function formatMoney(value: any) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n.toFixed(2);
}

function normalizeLineItems(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item: any) => item && typeof item === "object")
    .map((item: any) => ({
      title: item.title || item.productTitle || "Product",
      variantTitle: item.variantTitle || item.variant || null,
      sku: item.sku || null,
      quantity: Number(item.quantity || 0),
      price: item.price ?? item.unitPrice ?? null,
      url: item.url || null,
    }));
}

async function logResult(params: {
  shop: string;
  sourceType: string;
  sourceId: string;
  email: string;
  subject: string;
  ok: boolean;
  errorMessage?: string | null;
}) {
  await prisma.reminderEmailLog.upsert({
    where: {
      shop_sourceType_sourceId: {
        shop: params.shop,
        sourceType: params.sourceType,
        sourceId: params.sourceId,
      },
    },
    create: {
      shop: params.shop,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      email: params.email,
      subject: params.subject,
      ok: params.ok,
      errorMessage: params.errorMessage || null,
    },
    update: {
      email: params.email,
      subject: params.subject,
      ok: params.ok,
      errorMessage: params.errorMessage || null,
      sentAt: new Date(),
    },
  });
}

export async function runReminderJobForShop(shop: string) {
  const setting = await prisma.cartReminderSetting.findUnique({ where: { shop } });
  if (!setting || !setting.isEnabled) return { shop, skipped: true, reason: "disabled" };

  const cutoff = daysAgo(setting.daysAfter);
  const summary = {
    shop,
    cartCandidates: 0,
    cartSent: 0,
    checkoutSynced: 0,
    checkoutCandidates: 0,
    checkoutSent: 0,
    skippedOrdered: 0,
    failed: 0,
  };

  if (setting.abandonedCheckoutEnabled) {
    const sync = await syncAbandonedCheckoutsForShop(shop, cutoff);
    summary.checkoutSynced = sync.synced;
  }

  if (setting.loggedInCartEnabled) {
    const carts = await prisma.customerCart.findMany({
      where: {
        shop,
        reminderSentAt: null,
        orderedAt: null,
        itemCount: { gt: 0 },
        lastCapturedAt: { lte: cutoff },
      },
      take: 100,
      orderBy: { lastCapturedAt: "asc" },
    });
    summary.cartCandidates = carts.length;

    for (const cart of carts) {
      try {
        const ordered = await customerHasOrderSince({ shop, email: cart.customerEmail, since: cart.lastCapturedAt });
        if (ordered) {
          await prisma.customerCart.update({ where: { id: cart.id }, data: { orderedAt: new Date() } });
          summary.skippedOrdered += 1;
          continue;
        }
        const html = renderReminderEmail({
          setting,
          shop,
          email: cart.customerEmail,
          cartUrl: cart.cartUrl || setting.storefrontUrl || `https://${shop}/cart`,
          itemCount: cart.itemCount,
          total: formatMoney(cart.subtotal),
          currencyCode: cart.currencyCode,
          sourceLabel: "Logged-in cart",
          lineItems: normalizeLineItems(cart.lineItems),
        });
        const result = await sendReminderEmail({
          to: cart.customerEmail,
          subject: setting.subject,
          html,
          fromName: setting.fromName,
        });
        await logResult({
          shop,
          sourceType: "LOGGED_IN_CART",
          sourceId: cart.id,
          email: cart.customerEmail,
          subject: setting.subject,
          ok: result.ok,
          errorMessage: result.ok ? null : String((result as any).error || "Email failed"),
        });
        if (result.ok) {
          await prisma.customerCart.update({ where: { id: cart.id }, data: { reminderSentAt: new Date() } });
          summary.cartSent += 1;
        } else {
          summary.failed += 1;
        }
      } catch (error: any) {
        summary.failed += 1;
        await logResult({
          shop,
          sourceType: "LOGGED_IN_CART",
          sourceId: cart.id,
          email: cart.customerEmail,
          subject: setting.subject,
          ok: false,
          errorMessage: String(error?.message || error),
        });
      }
    }
  }

  if (setting.abandonedCheckoutEnabled) {
    const checkouts = await prisma.abandonedCheckoutReminder.findMany({
      where: {
        shop,
        reminderSentAt: null,
        checkoutCompletedAt: null,
        checkoutCreatedAt: { lte: cutoff },
      },
      take: 100,
      orderBy: { checkoutCreatedAt: "asc" },
    });
    summary.checkoutCandidates = checkouts.length;

    for (const checkout of checkouts) {
      try {
        const html = renderReminderEmail({
          setting,
          shop,
          email: checkout.customerEmail,
          cartUrl: checkout.checkoutUrl,
          itemCount: checkout.itemCount,
          total: formatMoney(checkout.totalPrice),
          currencyCode: checkout.currencyCode,
          sourceLabel: "Abandoned checkout",
          lineItems: normalizeLineItems(checkout.lineItems),
        });
        const result = await sendReminderEmail({
          to: checkout.customerEmail,
          subject: setting.subject,
          html,
          fromName: setting.fromName,
        });
        await logResult({
          shop,
          sourceType: "ABANDONED_CHECKOUT",
          sourceId: checkout.id,
          email: checkout.customerEmail,
          subject: setting.subject,
          ok: result.ok,
          errorMessage: result.ok ? null : String((result as any).error || "Email failed"),
        });
        if (result.ok) {
          await prisma.abandonedCheckoutReminder.update({ where: { id: checkout.id }, data: { reminderSentAt: new Date() } });
          summary.checkoutSent += 1;
        } else {
          summary.failed += 1;
        }
      } catch (error: any) {
        summary.failed += 1;
        await logResult({
          shop,
          sourceType: "ABANDONED_CHECKOUT",
          sourceId: checkout.id,
          email: checkout.customerEmail,
          subject: setting.subject,
          ok: false,
          errorMessage: String(error?.message || error),
        });
      }
    }
  }

  await prisma.cartReminderSetting.update({ where: { shop }, data: { lastCronRunAt: new Date() } });
  return summary;
}

export async function runReminderJobAllShops() {
  const settings = await prisma.cartReminderSetting.findMany({ where: { isEnabled: true } });
  const results = [];
  for (const setting of settings) {
    results.push(await runReminderJobForShop(setting.shop));
  }
  return results;
}
