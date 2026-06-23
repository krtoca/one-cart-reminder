import { shopifyGraphQL } from "../lib/shopify-admin.server";

export async function customerHasOrderSince(params: { shop: string; email: string; since: Date }) {
  const iso = params.since.toISOString();
  const queryString = `email:${params.email} created_at:>=${iso}`;
  const query = `#graphql
    query OrdersSince($query: String!) {
      orders(first: 1, query: $query, sortKey: CREATED_AT, reverse: true) {
        nodes { id createdAt }
      }
    }
  `;

  const data = await shopifyGraphQL<any>(params.shop, query, { query: queryString });
  return Boolean(data?.orders?.nodes?.length);
}
