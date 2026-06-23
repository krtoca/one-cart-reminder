import type { LoaderFunctionArgs } from "@remix-run/node";
import { Outlet, useLoaderData, useLocation } from "@remix-run/react";
import { AppProvider } from "@shopify/polaris";
import "@shopify/polaris/build/esm/styles.css";
import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);

  const url = new URL(request.url);

  return {
    shop: url.searchParams.get("shop") || "",
    host: url.searchParams.get("host") || "",
  };
}

function isActive(pathname: string, target: string) {
  if (target === "/app") {
    return pathname === "/app" || pathname === "/app/";
  }

  return pathname.startsWith(target);
}

export default function EmbeddedApp() {
  const data = useLoaderData<typeof loader>();
  const location = useLocation();

  const embeddedSearch = location.search || "";
  const embeddedUrl = (path: string) => `${path}${embeddedSearch}`;

  const navItems = [
    { label: "Dashboard", path: "/app", url: embeddedUrl("/app") },
    { label: "Cart History", path: "/app/cart-history", url: embeddedUrl("/app/cart-history") },
    { label: "Settings", path: "/app/settings", url: embeddedUrl("/app/settings") },
  ];

  return (
    <AppProvider i18n={{}}>
      <main className="app-shell">
        <section className="app-header-card">
          <div className="app-title-row">
            <div className="app-logo">CR</div>
            <div>
              <h1>One Cart Reminder</h1>
              <p>Cart tracking, abandoned checkout reminders, and cart history.</p>
            </div>
            {data.shop ? <span className="shop-pill">{data.shop}</span> : null}
          </div>

          <nav className="top-nav" aria-label="One Cart Reminder navigation">
            {navItems.map((item) => (
              <a
                key={item.label}
                href={item.url}
                className={isActive(location.pathname, item.path) ? "active" : ""}
              >
                {item.label}
              </a>
            ))}
          </nav>
        </section>

        <section className="app-content">
          <Outlet />
        </section>
      </main>
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return (
    <AppProvider i18n={{}}>
      <main className="app-shell">
        <section className="app-header-card">
          <div className="app-title-row">
            <div className="app-logo">CR</div>
            <div>
              <h1>One Cart Reminder</h1>
              <p>The Shopify embedded session needs to be refreshed.</p>
            </div>
          </div>

          <nav className="top-nav" aria-label="One Cart Reminder navigation">
            <a href="/auth/login" className="active">
              Reconnect app
            </a>
          </nav>
        </section>

        <section className="app-content">
          <div className="panel-card">
            <h2>App session could not load</h2>
            <p>
              Please click <strong>Reconnect app</strong>, or reopen this app from
              Shopify Admin → Apps → Cart Reminder.
            </p>
            <p>
              If this happens immediately after installation, refresh the Shopify
              Admin page once.
            </p>
          </div>
        </section>
      </main>
    </AppProvider>
  );
}
