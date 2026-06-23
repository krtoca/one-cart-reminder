import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);

  // Keep Shopify embedded/OAuth parameters when Shopify opens the app at root.
  return redirect(`/app${url.search || ""}`);
}

export default function Index() {
  return null;
}
