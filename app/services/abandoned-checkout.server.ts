import prisma from "../db.server";
import { shopifyGraphQL } from "../lib/shopify-admin.server";

function moneyAmount(set: any) {
  return set?.shopMoney?.amount ? Number(set.shopMoney.amount) : null;
}
function moneyCurrency(set: any) {
  return set?.shopMoney?.currencyCode ? String(set.shopMoney.currencyCode) : null;
}

function lineItemsAmount(lineItems: Array<{ quantity?: number | string | null; price?: number | string | null }>) {
  const total = lineItems.reduce((sum, item) => {
    const quantity = Number(item.quantity || 0);
    const price = Number(item.price || 0);
    return Number.isFinite(quantity) && Number.isFinite(price) ? sum + quantity * price : sum;
  }, 0);

  return total > 0 ? Number(total.toFixed(2)) : null;
}

export async function syncAbandonedCheckoutsForShop(shop: string, olderThan: Date) {
  const queryString = `created_at:<=${olderThan.toISOString()} recovery_state:not_recovered status:open`;
  const query = `#graphql
    query AbandonedCheckouts($query: String!) {
      abandonedCheckouts(first: 50, query: $query, sortKey: CREATED_AT, reverse: false) {
        nodes {
          id
          name
          abandonedCheckoutUrl
          completedAt
          createdAt
          updatedAt
          customer { id email firstName lastName }
          totalPriceSet { shopMoney { amount currencyCode } }
          lineItems(first: 20) {
            nodes {
              title
              quantity
              variantTitle
              originalUnitPriceSet { shopMoney { amount currencyCode } }
            }
          }
        }
      }
    }
  `;

  const data = await shopifyGraphQL<any>(shop, query, { query: queryString });
  const nodes = data?.abandonedCheckouts?.nodes || [];
  let synced = 0;

  for (const node of nodes) {
    const email = node?.customer?.email;
    if (!node?.id || !email || node.completedAt) continue;

    const lineItems = (node.lineItems?.nodes || []).map((item: any) => ({
      title: item.title,
      variantTitle: item.variantTitle,
      variantId: null,
      sku: null,
      quantity: Number(item.quantity || 0),
      price: item.originalUnitPriceSet?.shopMoney?.amount || null,
      currencyCode: item.originalUnitPriceSet?.shopMoney?.currencyCode || null,
    }));
    const itemCount = lineItems.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0);
    const computedTotalPrice = moneyAmount(node.totalPriceSet) ?? lineItemsAmount(lineItems);
    const computedCurrencyCode = moneyCurrency(node.totalPriceSet) || lineItems.find((item: any) => item.currencyCode)?.currencyCode || "CAD";

    await prisma.abandonedCheckoutReminder.upsert({
      where: { shop_abandonedCheckoutId: { shop, abandonedCheckoutId: node.id } },
      create: {
        shop,
        abandonedCheckoutId: node.id,
        checkoutName: node.name || null,
        customerEmail: email,
        customerId: node.customer?.id || null,
        checkoutUrl: String(node.abandonedCheckoutUrl),
        totalPrice: computedTotalPrice,
        currencyCode: computedCurrencyCode,
        itemCount,
        lineItems,
        checkoutCreatedAt: new Date(node.createdAt),
        checkoutUpdatedAt: new Date(node.updatedAt),
        checkoutCompletedAt: node.completedAt ? new Date(node.completedAt) : null,
        lastSyncedAt: new Date(),
      },
      update: {
        checkoutName: node.name || null,
        customerEmail: email,
        customerId: node.customer?.id || null,
        checkoutUrl: String(node.abandonedCheckoutUrl),
        totalPrice: computedTotalPrice,
        currencyCode: computedCurrencyCode,
        itemCount,
        lineItems,
        checkoutUpdatedAt: new Date(node.updatedAt),
        checkoutCompletedAt: node.completedAt ? new Date(node.completedAt) : null,
        lastSyncedAt: new Date(),
      },
    });
    synced += 1;
  }

  return { synced };
}
