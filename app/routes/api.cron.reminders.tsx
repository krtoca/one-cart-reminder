import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { runReminderJobAllShops, runReminderJobForShop } from "../services/reminder-runner.server";
import { ensureAutoReminderSchedulerStarted } from "../services/auto-reminder-scheduler.server";
ensureAutoReminderSchedulerStarted();

function assertCron(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Response("CRON_SECRET is not configured", { status: 500 });
  const auth = request.headers.get("authorization") || "";
  const token = request.headers.get("x-cron-secret") || auth.replace(/^Bearer\s+/i, "");
  if (token !== secret) throw new Response("Unauthorized", { status: 401 });
}

export async function loader({ request }: LoaderFunctionArgs) {
  assertCron(request);
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const result = shop ? await runReminderJobForShop(shop) : await runReminderJobAllShops();
  return json({ ok: true, result });
}

export async function action({ request }: ActionFunctionArgs) {
  assertCron(request);
  const body = await request.json().catch(() => ({}));
  const result = body.shop ? await runReminderJobForShop(body.shop) : await runReminderJobAllShops();
  return json({ ok: true, result });
}
