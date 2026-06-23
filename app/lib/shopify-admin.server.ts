import { sessionStorage } from "../shopify.server";

const API_VERSION = "2026-04";

export function normalizeShop(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
}

export async function getOfflineToken(shop: string) {
  const normalized = normalizeShop(shop);
  const sessionId = `offline_${normalized}`;
  const session = await sessionStorage.loadSession(sessionId);
  if (!session?.accessToken) throw new Error(`Missing offline session for ${normalized}`);
  return session.accessToken;
}

export async function shopifyGraphQL<T = any>(shop: string, query: string, variables?: Record<string, any>) {
  const normalized = normalizeShop(shop);
  const token = await getOfflineToken(normalized);
  const response = await fetch(`https://${normalized}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables: variables || {} }),
  });

  const json: any = await response.json();
  if (!response.ok || json.errors) {
    throw new Error(`Shopify GraphQL failed for ${normalized}: ${JSON.stringify(json.errors || json)}`);
  }
  return json.data as T;
}
