import type { LoaderFunctionArgs } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useLocation, useRouteError, isRouteErrorResponse } from "@remix-run/react";
import { AppProvider, Badge, BlockStack, Box, Card, Text } from "@shopify/polaris";
import "@shopify/polaris/build/esm/styles.css";
import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  return {
    shop: session.shop,
    appName: "One Cart Reminder",
  };
}

const navItems = [
  { label: "Dashboard", to: "/app", match: "/app" },
  { label: "Cart History", to: "/app/cart-history", match: "/app/cart-history" },
  { label: "Settings", to: "/app/settings", match: "/app/settings" },
];

function currentPageLabel(pathname: string) {
  if (pathname.includes("/cart-history")) return "Cart History";
  if (pathname.includes("/settings")) return "Settings";
  return "Dashboard";
}

function TopMenu() {
  const location = useLocation();
  const search = location.search || "";

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
      {navItems.map((item) => {
        const isActive = item.match === "/app" ? location.pathname === "/app" : location.pathname.startsWith(item.match);
        return (
          <Link
            key={item.to}
            to={`${item.to}${search}`}
            prefetch="intent"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "9px 14px",
              borderRadius: 999,
              textDecoration: "none",
              fontSize: 14,
              fontWeight: 650,
              lineHeight: 1,
              border: isActive ? "1px solid #111827" : "1px solid #dfe3e8",
              background: isActive ? "#111827" : "#ffffff",
              color: isActive ? "#ffffff" : "#374151",
              boxShadow: isActive ? "0 1px 2px rgba(0,0,0,0.12)" : "none",
            }}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

function AppShell() {
  const { shop, appName } = useLoaderData<typeof loader>();
  const location = useLocation();
  const pageLabel = currentPageLabel(location.pathname);

  return (
    <AppProvider i18n={{}}>
      <div style={{ background: "#f6f6f7", minHeight: "100vh" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto", padding: "20px 20px 40px" }}>
          <Card>
            <Box padding="500">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div
                      aria-hidden="true"
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        display: "grid",
                        placeItems: "center",
                        background: "linear-gradient(135deg, #e0f2fe, #f0f9ff)",
                        border: "1px solid #bae6fd",
                        color: "#0369a1",
                        fontWeight: 800,
                      }}
                    >
                      CR
                    </div>
                    <div>
                      <Text as="h1" variant="headingLg">{appName}</Text>
                      <Text as="p" tone="subdued">Cart tracking, abandoned checkout reminders, and cart history</Text>
                    </div>
                  </div>
                  <TopMenu />
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Badge tone="info">{pageLabel}</Badge>
                  <Badge>{shop}</Badge>
                </div>
              </div>
            </Box>
          </Card>

          <div style={{ marginTop: 16 }}>
            <Outlet />
          </div>
        </div>
      </div>
    </AppProvider>
  );
}

export default function EmbeddedApp() {
  return <AppShell />;
}

export function ErrorBoundary() {
  const error = useRouteError();
  const title = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : "App error";
  const message = isRouteErrorResponse(error)
    ? typeof error.data === "string"
      ? error.data
      : JSON.stringify(error.data)
    : error instanceof Error
      ? error.message
      : "Unknown error";

  return (
    <AppProvider i18n={{}}>
      <div style={{ background: "#f6f6f7", minHeight: "100vh", padding: 24 }}>
        <Card>
          <Box padding="500">
            <BlockStack gap="300">
              <Text as="h1" variant="headingLg">One Cart Reminder</Text>
              <Text as="h2" variant="headingMd" tone="critical">{title}</Text>
              <pre style={{ whiteSpace: "pre-wrap", background: "#f4f4f4", padding: 12, borderRadius: 8 }}>{message}</pre>
              <Text as="p" tone="subdued">If this appears inside Shopify Admin, check the Render logs for the same timestamp.</Text>
            </BlockStack>
          </Box>
        </Card>
      </div>
    </AppProvider>
  );
}
