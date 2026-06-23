import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { login } from "../shopify.server";

function normalizeShop(shop: FormDataEntryValue | string | null) {
  if (!shop) return "";
  return String(shop).replace(/^https?:\/\//, "").replace(/\/$/, "").trim();
}

type LoaderData = {
  shop: string;
  error: string | null;
};

export async function loader({ request }: LoaderFunctionArgs): Promise<Response | LoaderData> {
  const url = new URL(request.url);
  const shop = normalizeShop(url.searchParams.get("shop"));

  // When Shopify Admin sends ?shop=..., this route must start Shopify's login flow.
  // Do not call authenticate.admin() here.
  if (shop) {
    return login(request);
  }

  // Browser Back can sometimes land on /auth/login without query params inside Shopify Admin.
  // Sending the merchant back to /app avoids the raw 200/JSON-style screen.
  const embedded = url.searchParams.get("embedded") || url.searchParams.get("host");
  if (embedded) {
    return redirect(`/app${url.search}`);
  }

  return { shop: "", error: null };
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const shop = normalizeShop(formData.get("shop"));

  if (!shop) {
    return { shop: "", error: "Please enter your Shopify store domain." };
  }

  const url = new URL(request.url);
  url.searchParams.set("shop", shop);
  return login(new Request(url.toString(), request));
}

export default function AuthLogin() {
  const loaderData = useLoaderData<typeof loader>() as LoaderData;
  const actionData = useActionData<typeof action>() as LoaderData | undefined;
  const error = actionData?.error || loaderData.error;

  return (
    <main style={{ fontFamily: "Arial, sans-serif", maxWidth: 520, margin: "48px auto", padding: 24 }}>
      <h1 style={{ marginBottom: 8 }}>One Cart Reminder</h1>
      <p style={{ color: "#555", marginBottom: 24 }}>Enter your Shopify store domain to continue.</p>
      <Form method="post" style={{ display: "grid", gap: 12 }}>
        <label htmlFor="shop" style={{ fontWeight: 600 }}>Shop domain</label>
        <input
          id="shop"
          name="shop"
          type="text"
          defaultValue={loaderData.shop}
          placeholder="your-store.myshopify.com"
          style={{ padding: "10px 12px", border: "1px solid #ccc", borderRadius: 6 }}
        />
        {error ? <div style={{ color: "#b42318" }}>{error}</div> : null}
        <button type="submit" style={{ padding: "10px 14px", border: 0, borderRadius: 6, background: "#111", color: "white", cursor: "pointer" }}>
          Continue
        </button>
      </Form>
    </main>
  );
}
