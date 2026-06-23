import "@shopify/shopify-app-remix/adapters/node";
import { ApiVersion, AppDistribution, shopifyApp } from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY || "",
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  // Keep this configurable so the app can run with older Shopify packages whose ApiVersion enum
  // may not yet include the newest Shopify API version names.
  apiVersion: (process.env.SHOPIFY_API_VERSION || "2025-10") as ApiVersion,
  scopes: (process.env.SCOPES || "read_orders,read_customers,read_checkouts").split(",").map((s) => s.trim()).filter(Boolean),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  future: {
    unstable_newEmbeddedAuthStrategy: true,
  },
  hooks: {
    afterAuth: async ({ session }) => {
      await prisma.cartReminderSetting.upsert({
        where: { shop: session.shop },
        create: {
          shop: session.shop,
          storefrontUrl: `https://${session.shop}`,
        },
        update: {},
      });
    },
  },
});

export const authenticate = shopify.authenticate;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
export default shopify;
