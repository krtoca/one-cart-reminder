import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { login } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  // If Shopify did not provide a shop parameter, send the user back to the
  // embedded app entry. Shopify Admin normally rehydrates the embedded context
  // when the app is reopened from the Apps sidebar.
  if (!shop) {
    return redirect("/app");
  }

  const result = await login(request);

  if (result instanceof Response) {
    return result;
  }

  return redirect("/app");
}

export default function AuthLogin() {
  return (
    <main style={{ padding: 24, fontFamily: "Arial, sans-serif" }}>
      <h1>One Cart Reminder</h1>
      <p>Starting Shopify login...</p>
      <p>
        If this page does not redirect, please reopen the app from Shopify Admin
        Apps.
      </p>
    </main>
  );
}
