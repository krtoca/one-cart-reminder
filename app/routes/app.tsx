import type { LoaderFunctionArgs } from "@remix-run/node";
import { Outlet, useLoaderData, useLocation } from "@remix-run/react";
import { AppProvider } from "@shopify/polaris";
import "@shopify/polaris/build/esm/styles.css";
import { authenticate } from "../shopify.server";
import { ensureAutoReminderSchedulerStarted } from "../services/auto-reminder-scheduler.server";
ensureAutoReminderSchedulerStarted();

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

const shellCss = `
  .cr-shell {
    max-width: 1280px;
    margin: 0 auto;
    padding: 24px 28px 48px;
    color: #202223;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .cr-header-card {
    background: #ffffff;
    border: 1px solid #dfe3e8;
    border-radius: 12px;
    box-shadow: 0 1px 2px rgba(0,0,0,0.06);
    padding: 20px 24px;
    margin-bottom: 22px;
  }

  .cr-title-row {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
  }

  .cr-logo {
    width: 38px;
    height: 38px;
    border-radius: 10px;
    background: linear-gradient(135deg, #dff5ff, #bfefff);
    color: #005bd3;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 0.02em;
    flex: 0 0 auto;
  }

  .cr-title-copy {
    min-width: 240px;
    flex: 1 1 auto;
  }

  .cr-title-copy h1 {
    margin: 0;
    font-size: 22px;
    line-height: 1.25;
    font-weight: 700;
    color: #202223;
  }

  .cr-title-copy p {
    margin: 4px 0 0;
    color: #6d7175;
    font-size: 13px;
    line-height: 1.35;
  }

  .cr-shop-pill {
    display: inline-flex;
    align-items: center;
    max-width: 360px;
    padding: 5px 10px;
    border-radius: 999px;
    background: #f1f2f3;
    color: #44474a;
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .cr-top-nav {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 18px;
    flex-wrap: wrap;
  }

  .cr-top-nav a {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 34px;
    padding: 7px 14px;
    border-radius: 999px;
    border: 1px solid #c9cccf;
    background: #ffffff;
    color: #202223;
    font-size: 13px;
    font-weight: 600;
    text-decoration: none;
    line-height: 1;
  }

  .cr-top-nav a:hover {
    background: #f6f6f7;
  }

  .cr-top-nav a.active {
    background: #202223;
    color: #ffffff;
    border-color: #202223;
  }

  .cr-content {
    display: block;
  }

  .cr-error-card {
    background: #ffffff;
    border: 1px solid #dfe3e8;
    border-radius: 12px;
    padding: 24px;
    box-shadow: 0 1px 2px rgba(0,0,0,0.06);
  }

  .cr-error-card h2 {
    margin: 0 0 8px;
    font-size: 20px;
  }

  .cr-error-card p {
    margin: 0 0 8px;
    color: #6d7175;
  }

  @media (max-width: 720px) {
    .cr-shell {
      padding: 16px 14px 36px;
    }

    .cr-header-card {
      padding: 16px;
    }

    .cr-title-row {
      align-items: flex-start;
    }

    .cr-shop-pill {
      max-width: 100%;
    }
  }
`;

export default function EmbeddedApp() {
  const data = useLoaderData<typeof loader>();
  const location = useLocation();

  const embeddedSearch = location.search || "";
  const embeddedUrl = (path: string) => `${path}${embeddedSearch}`;

  const navItems = [
    { label: "Dashboard", path: "/app/dashboard", url: embeddedUrl("/app/dashboard") },
    { label: "Cart History", path: "/app/cart-history", url: embeddedUrl("/app/cart-history") },
    { label: "Settings", path: "/app/settings", url: embeddedUrl("/app/settings") },
  ];

  return (
    <AppProvider i18n={{}}>
      <style dangerouslySetInnerHTML={{ __html: shellCss }} />
      <main className="cr-shell">
        <section className="cr-header-card">
          <div className="cr-title-row">
            <div className="cr-logo">CR</div>
            <div className="cr-title-copy">
              <h1>One Cart Reminder</h1>
              <p>Cart tracking, abandoned checkout reminders, and cart history.</p>
            </div>
            {data.shop ? <span className="cr-shop-pill">{data.shop}</span> : null}
          </div>

          <nav className="cr-top-nav" aria-label="One Cart Reminder navigation">
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

        <section className="cr-content">
          <Outlet />
        </section>
      </main>
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return (
    <AppProvider i18n={{}}>
      <style dangerouslySetInnerHTML={{ __html: shellCss }} />
      <main className="cr-shell">
        <section className="cr-header-card">
          <div className="cr-title-row">
            <div className="cr-logo">CR</div>
            <div className="cr-title-copy">
              <h1>One Cart Reminder</h1>
              <p>The Shopify embedded session needs to be refreshed.</p>
            </div>
          </div>

          <nav className="cr-top-nav" aria-label="One Cart Reminder navigation">
            <a href="/auth/login" className="active">
              Reconnect app
            </a>
          </nav>
        </section>

        <section className="cr-content">
          <div className="cr-error-card">
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
