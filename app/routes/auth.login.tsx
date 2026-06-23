import type { LoaderFunctionArgs } from "@remix-run/node";
import { login } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  return login(request);
}
