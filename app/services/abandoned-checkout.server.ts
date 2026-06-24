import prisma from "../db.server";
import { shopifyGraphQL } from "../lib/shopify-admin.server";

function moneyAmount(set: any) {
  return set?.shopMoney?.amount ? Number(set.shopMoney.amount) : null;
}
function moneyCurrency(set: any) {
  return set?.shopMoney?.currencyCode ? String(set.shopMoney.currencyCode) : null;
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
    }));
    const itemCount = lineItems.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0);

    await prisma.abandonedCheckoutReminder.upsert({
      where: { shop_abandonedCheckoutId: { shop, abandonedCheckoutId: node.id } },
      create: {
        shop,
        abandonedCheckoutId: node.id,
        checkoutName: node.name || null,
        customerEmail: email,
        customerId: node.customer?.id || null,
        checkoutUrl: String(node.abandonedCheckoutUrl),
        totalPrice: moneyAmount(node.totalPriceSet),
        currencyCode: moneyCurrency(node.totalPriceSet),
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
        totalPrice: moneyAmount(node.totalPriceSet),
        currencyCode: moneyCurrency(node.totalPriceSet),
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
