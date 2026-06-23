import type { LoaderFunctionArgs } from "@remix-run/node";
import { NavLink, Outlet, useLoaderData, useLocation } from "@remix-run/react";
import { AppProvider, Badge, Box, Card, Text } from "@shopify/polaris";
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
  { label: "Dashboard", to: "/app", end: true },
  { label: "Cart History", to: "/app/cart-history", end: false },
  { label: "Settings", to: "/app/settings", end: false },
];

function activePageLabel(pathname: string) {
  if (pathname.includes("/cart-history")) return "Cart History";
  if (pathname.includes("/settings")) return "Settings";
  return "Dashboard";
}

function TopNavigation() {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        marginTop: 16,
      }}
    >
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          style={({ isActive }) => ({
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
          })}
        >
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}

function AppHeader() {
  const { shop, appName } = useLoaderData<typeof loader>();
  const location = useLocation();
  const pageLabel = activePageLabel(location.pathname);

  return (
    <Card>
      <Box padding="500">
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <div
                aria-hidden="true"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  display: "grid",
                  placeItems: "center",
                  background: "linear-gradient(135deg, #e0f2fe, #f0f9ff)",
                  border: "1px solid #bae6fd",
                  fontWeight: 800,
                  color: "#0369a1",
                }}
              >
                CR
              </div>
              <div>
                <Text as="h1" variant="headingLg">
                  {appName}
                </Text>
                <Text as="p" tone="subdued">
                  Cart tracking, abandoned checkout reminders, and customer cart history
                </Text>
              </div>
            </div>
            <TopNavigation />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Badge tone="info">{pageLabel}</Badge>
            <Badge>{shop}</Badge>
          </div>
        </div>
      </Box>
    </Card>
  );
}

export default function EmbeddedApp() {
  return (
    <AppProvider i18n={{}}>
      <div style={{ background: "#f6f6f7", minHeight: "100vh" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "20px 20px 32px" }}>
          <AppHeader />
          <div style={{ marginTop: 16 }}>
            <Outlet />
          </div>
        </div>
      </div>
    </AppProvider>
  );
}
