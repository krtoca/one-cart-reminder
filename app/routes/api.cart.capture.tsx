import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
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

async function markActiveCartClearedWhenEmpty(params: {
  shop: string;
  customerId?: string | null;
  customerEmail?: string | null;
  itemCount: number;
}) {
  if (params.itemCount > 0) return false;

  const where: any = {
    shop: params.shop,
    orderedAt: null,
  };

  if (params.customerId) {
    where.customerId = String(params.customerId);
  } else if (params.customerEmail) {
    where.customerEmail = String(params.customerEmail).toLowerCase();
  } else {
    return false;
  }

  await prisma.customerCart.updateMany({
    where,
    data: {
      itemCount: 0,
      subtotal: "0",
      lineItems: [],
      orderedAt: new Date(),
      lastCapturedAt: new Date(),
    },
  });

  return true;
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const payload = await request.json();

  const clearedEmptyCart = await markActiveCartClearedWhenEmpty({
    shop,
    customerId: typeof customerId !== "undefined" ? customerId : null,
    customerEmail: typeof customerEmail !== "undefined" ? customerEmail : null,
    itemCount: typeof itemCount !== "undefined" ? Number(itemCount || 0) : typeof cartItemCount !== "undefined" ? Number(cartItemCount || 0) : 0,
  });

  if (clearedEmptyCart) {
    return json({ ok: true, cleared: true });
  }


    const result = await captureLoggedInCustomerCart(payload);
    return json(result, { headers: corsHeaders });
  } catch (error: any) {
    return json({ ok: false, error: String(error?.message || error) }, { status: 400, headers: corsHeaders });
  }
}
