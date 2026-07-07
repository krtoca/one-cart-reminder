import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { getSavedCartForAutoSync } from "../services/cart-sync.server";
import { ensureAutoReminderSchedulerStarted } from "../services/auto-reminder-scheduler.server";
ensureAutoReminderSchedulerStarted();

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
