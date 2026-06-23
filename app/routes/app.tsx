import type { LoaderFunctionArgs } from "@remix-run/node";
import { Outlet, useLoaderData, useLocation } from "@remix-run/react";
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
    { label: "Dashboard", url: embeddedUrl("/app") },
    { label: "Cart History", url: embeddedUrl("/app/cart-history") },
    { label: "Settings", url: embeddedUrl("/app/settings") },
  ];

  return (
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
              className={isActive(location.pathname, item.url.split("?")[0]) ? "active" : ""}
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
  );
}

export function ErrorBoundary() {
  return (
    <main className="app-shell">
      <section className="app-header-card">
        <div className="app-title-row">
          <div className="app-logo">CR</div>
          <div>
            <h1>One Cart Reminder</h1>
            <p>Something went wrong while loading this embedded app.</p>
          </div>
        </div>
      </section>

      <section className="app-content">
        <div className="panel-card">
          <h2>Page could not load</h2>
          <p>
            Please refresh the Shopify Admin page or reopen the app from Apps →
            One Cart Reminder.
          </p>
        </div>
      </section>
    </main>
  );
}
