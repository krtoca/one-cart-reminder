import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { captureLoggedInCustomerCart } from "../services/cart-capture.server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function loader({ request }: LoaderFunctionArgs) {
  void import("../services/auto-reminder-scheduler.server")
    .then((module) => module.ensureAutoReminderSchedulerStarted())
    .catch((error) => console.error("[cart-reminder] automatic reminder scheduler start failed", error?.message || error));

  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  return json({ ok: true }, { headers: corsHeaders });
}

export async function action({ request }: ActionFunctionArgs) {
  void import("../services/auto-reminder-scheduler.server")
    .then((module) => module.ensureAutoReminderSchedulerStarted())
    .catch((error) => console.error("[cart-reminder] automatic reminder scheduler start failed", error?.message || error));

  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const payload = await request.json();
    const result = await captureLoggedInCustomerCart(payload);
    return json(result, { headers: corsHeaders });
  } catch (error: any) {
    return json({ ok: false, error: String(error?.message || error) }, { status: 400, headers: corsHeaders });
  }
}
