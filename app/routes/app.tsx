import type { LoaderFunctionArgs } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { AppProvider, Frame, Navigation } from "@shopify/polaris";
import "@shopify/polaris/build/esm/styles.css";
import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
}

export default function EmbeddedApp() {
  useLoaderData<typeof loader>();
  return (
    <AppProvider i18n={{}}>
      <Frame
        navigation={
          <Navigation location="/app">
            <Navigation.Section
              items={[
                { label: "Dashboard", url: "/app" },
                { label: "Cart history", url: "/app/cart-history" },
                { label: "Settings", url: "/app/settings" },
              ]}
            />
          </Navigation>
        }
      >
        <Outlet />
      </Frame>
    </AppProvider>
  );
}
