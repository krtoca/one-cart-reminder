import prisma from "../db.server";
import { runReminderJobForShop } from "./reminder-runner.server";

type ReminderSettingForSchedule = {
  shop: string;
  dailySendHour: number;
  timezone: string | null;
  lastCronRunAt: Date | null;
};

declare global {
  // eslint-disable-next-line no-var
  var __oneCartReminderAutoSchedulerStarted: boolean | undefined;
  // eslint-disable-next-line no-var
  var __oneCartReminderAutoSchedulerRunning: boolean | undefined;
}

const DEFAULT_TIMEZONE = "America/Toronto";
const DEFAULT_CHECK_INTERVAL_MS = 15 * 60 * 1000;

function safeTimezone(value: string | null | undefined) {
  return value || DEFAULT_TIMEZONE;
}

function localDateParts(date: Date, timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);

    const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
    return {
      year: get("year"),
      month: get("month"),
      day: get("day"),
      hour: Number(get("hour")),
    };
  } catch (_error) {
    if (timeZone === "UTC") throw _error;
    return localDateParts(date, "UTC");
  }
}

function localDateKey(date: Date, timeZone: string) {
  const parts = localDateParts(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function shouldRunForSetting(setting: ReminderSettingForSchedule, now: Date) {
  const timeZone = safeTimezone(setting.timezone);
  const configuredHour = Number(setting.dailySendHour);
  const sendHour = Number.isInteger(configuredHour) && configuredHour >= 0 && configuredHour <= 23 ? configuredHour : 9;
  const nowParts = localDateParts(now, timeZone);

  if (nowParts.hour !== sendHour) return false;

  if (setting.lastCronRunAt) {
    const lastRunDate = localDateKey(setting.lastCronRunAt, timeZone);
    const today = localDateKey(now, timeZone);
    if (lastRunDate === today) return false;
  }

  return true;
}

export async function runDueReminderJobs() {
  const now = new Date();
  const settings = await prisma.cartReminderSetting.findMany({
    where: { isEnabled: true },
    select: {
      shop: true,
      dailySendHour: true,
      timezone: true,
      lastCronRunAt: true,
    },
  });

  const dueSettings = settings.filter((setting) => shouldRunForSetting(setting, now));
  const results = [];

  for (const setting of dueSettings) {
    try {
      results.push(await runReminderJobForShop(setting.shop));
    } catch (error: any) {
      results.push({
        shop: setting.shop,
        failed: true,
        error: String(error?.message || error),
      });
    }
  }

  return {
    ok: true,
    checkedAt: now.toISOString(),
    shopsChecked: settings.length,
    dueShops: dueSettings.map((setting) => setting.shop),
    results,
  };
}

async function tick() {
  if (global.__oneCartReminderAutoSchedulerRunning) return;
  global.__oneCartReminderAutoSchedulerRunning = true;

  try {
    const result = await runDueReminderJobs();
    if (result.dueShops.length > 0) {
      console.log("[cart-reminder] automatic reminder result", JSON.stringify(result));
    }
  } catch (error: any) {
    console.error("[cart-reminder] automatic reminder failed", error?.message || error);
  } finally {
    global.__oneCartReminderAutoSchedulerRunning = false;
  }
}

export function ensureAutoReminderSchedulerStarted() {
  if (global.__oneCartReminderAutoSchedulerStarted) return;

  const enabledValue = String(process.env.AUTO_REMINDERS_ENABLED || "true").toLowerCase();
  if (["0", "false", "no", "off"].includes(enabledValue)) {
    console.log("[cart-reminder] automatic reminder scheduler disabled");
    return;
  }

  const configuredInterval = Number(process.env.AUTO_REMINDER_CHECK_INTERVAL_MS || DEFAULT_CHECK_INTERVAL_MS);
  const intervalMs = Number.isFinite(configuredInterval) && configuredInterval >= 60_000 ? configuredInterval : DEFAULT_CHECK_INTERVAL_MS;

  global.__oneCartReminderAutoSchedulerStarted = true;
  console.log(`[cart-reminder] automatic reminder scheduler started. intervalMs=${intervalMs}`);

  const firstTimer = setTimeout(() => {
    void tick();
  }, 60_000);
  if (typeof (firstTimer as any).unref === "function") (firstTimer as any).unref();

  const interval = setInterval(() => {
    void tick();
  }, intervalMs);
  if (typeof (interval as any).unref === "function") (interval as any).unref();
}
