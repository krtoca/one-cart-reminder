
const fs = require("fs");
const path = require("path");

const root = process.cwd();

const captureRoute = path.join(root, "app", "routes", "api.cart.capture.tsx");
const syncRoute = path.join(root, "app", "routes", "api.cart.sync.tsx");
const captureService = path.join(root, "app", "services", "cart-capture.server.ts");

if (!fs.existsSync(captureRoute)) {
  console.error("Missing:", captureRoute);
  process.exit(1);
}
if (!fs.existsSync(syncRoute)) {
  console.error("Missing:", syncRoute);
  process.exit(1);
}
if (!fs.existsSync(captureService)) {
  console.error("Missing:", captureService);
  process.exit(1);
}

fs.writeFileSync(captureRoute, `import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { captureLoggedInCustomerCart } from "../services/cart-capture.server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  return json({ ok: true }, { headers: corsHeaders });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const payload = await request.json();
    const result = await captureLoggedInCustomerCart(payload);
    return json(result, { headers: corsHeaders });
  } catch (error: any) {
    return json({ ok: false, error: String(error?.message || error) }, { status: 400, headers: corsHeaders });
  }
}
`, "utf8");

fs.writeFileSync(syncRoute, `import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { getSavedCartForAutoSync } from "../services/cart-sync.server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  return json({ ok: true }, { headers: corsHeaders });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const payload = await request.json();
    const result = await getSavedCartForAutoSync(payload);
    return json(result, { headers: corsHeaders });
  } catch (error: any) {
    return json({ ok: false, error: String(error?.message || error) }, { status: 400, headers: corsHeaders });
  }
}
`, "utf8");

let service = fs.readFileSync(captureService, "utf8");

// Add helper after normalizeEmail if not already present.
if (!service.includes("markActiveCartAsCleared")) {
  service = service.replace(
    /function normalizeEmail\(value: unknown\) \{\s*return String\(value \|\| ""\)\.trim\(\)\.toLowerCase\(\);\s*\}/,
    `function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

async function markActiveCartAsCleared(params: {
  shop: string;
  email: string;
  customerId?: string | null;
}) {
  const or: any[] = [{ customerEmail: params.email }];

  if (params.customerId) {
    or.push({ customerId: String(params.customerId) });
  }

  const result = await prisma.customerCart.updateMany({
    where: {
      shop: params.shop,
      orderedAt: null,
      OR: or,
    },
    data: {
      itemCount: 0,
      subtotal: null,
      lineItems: [],
      orderedAt: new Date(),
      lastCapturedAt: new Date(),
    },
  });

  return result.count;
}`
  );
}

// Replace old empty_cart skip with clearing logic.
service = service.replace(
  /if\s*\(itemCount <= 0\)\s*\{\s*return\s*\{\s*ok:\s*true,\s*skipped:\s*true,\s*reason:\s*"empty_cart"\s*\};\s*\}/,
  `if (itemCount <= 0) {
    const clearedCount = await markActiveCartAsCleared({
      shop,
      email,
      customerId: payload.customerId ? String(payload.customerId) : null,
    });

    return { ok: true, skipped: true, cleared: true, clearedCount, reason: "empty_cart" };
  }`
);

// If previous bad patch somehow added route helper into service, remove nothing else.

fs.writeFileSync(captureService, service, "utf8");

console.log("Fixed API route typecheck errors and moved empty-cart clearing into cart-capture service.");
console.log("Patched:");
console.log(" -", captureRoute);
console.log(" -", syncRoute);
console.log(" -", captureService);
