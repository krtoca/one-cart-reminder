# Run this from your project root: C:\Users\Jeff\desktop\shopify\one-cart-reminder

# 1) Fix invalid Polaris BlockStack gap value: "350" is not supported in this Polaris version.
$cartHistoryPath = "app/routes/app.cart-history.tsx"
if (Test-Path $cartHistoryPath) {
  (Get-Content $cartHistoryPath -Raw) -replace 'gap="350"', 'gap="400"' | Set-Content $cartHistoryPath -Encoding UTF8
  Write-Host "Fixed BlockStack gap in $cartHistoryPath"
} else {
  Write-Host "Missing $cartHistoryPath" -ForegroundColor Yellow
}

# 2) Fix /auth/login so Shopify login() return value is handled safely.
$authLoginPath = "app/routes/auth.login.tsx"
@'
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { login } from "../shopify.server";

type LoaderData = {
  error: string | null;
};

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    return json<LoaderData>({
      error: "Missing shop parameter. Please open One Cart Reminder from Shopify Admin → Apps.",
    });
  }

  const result = await login(request);

  if (result instanceof Response) {
    return result;
  }

  const loginError = result as { message?: string; error?: string };
  return json<LoaderData>(
    {
      error:
        loginError.message ||
        loginError.error ||
        "Shopify login could not start. Please open the app again from Shopify Admin → Apps.",
    },
    { status: 400 },
  );
}

export default function AuthLogin() {
  const data = useLoaderData<typeof loader>();

  return (
    <div style={{ padding: 24, fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <h2>One Cart Reminder</h2>
      <p>{data.error || "Starting Shopify login..."}</p>
    </div>
  );
}
'@ | Set-Content $authLoginPath -Encoding UTF8
Write-Host "Replaced $authLoginPath"
