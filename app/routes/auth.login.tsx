import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { login } from "../shopify.server";

type LoaderData = {
  error: string | null;
};

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    return json<LoaderData>(
      {
        error:
          "Missing shop parameter. Please open this app from Shopify Admin Apps.",
      },
      { status: 400 },
    );
  }

  const result = await login(request);

  if (result instanceof Response) {
    return result;
  }

  return json<LoaderData>(
    {
      error:
        "Shopify login could not start. Please reopen the app from Shopify Admin.",
    },
    { status: 400 },
  );
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
