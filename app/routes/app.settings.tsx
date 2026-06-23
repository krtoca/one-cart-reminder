import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useLoaderData, useNavigation } from "@remix-run/react";
import { Badge, Banner, BlockStack, Card, InlineGrid, Text } from "@shopify/polaris";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

function bool(value: FormDataEntryValue | null) {
  return value === "on" || value === "true";
}
function intValue(value: FormDataEntryValue | null, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
}
function text(value: FormDataEntryValue | null, fallback = "") {
  const v = typeof value === "string" ? value.trim() : "";
  return v || fallback;
}

function toSettingDTO(setting: any) {
  return {
    isEnabled: Boolean(setting.isEnabled),
    loggedInCartEnabled: Boolean(setting.loggedInCartEnabled),
    abandonedCheckoutEnabled: Boolean(setting.abandonedCheckoutEnabled),
    autoCartSyncEnabled: Boolean(setting.autoCartSyncEnabled),
    daysAfter: Number(setting.daysAfter || 7),
    dailySendHour: Number(setting.dailySendHour || 9),
    timezone: String(setting.timezone || "America/Toronto"),
    fromName: String(setting.fromName || "One Wholesale"),
    subject: String(setting.subject || "You left items in your cart"),
    headline: String(setting.headline || "Your cart is waiting"),
    bodyText: String(setting.bodyText || "You left some items in your cart. You can continue where you left off below."),
    buttonText: String(setting.buttonText || "Return to cart"),
    footerText: String(setting.footerText || "You can unsubscribe from marketing emails anytime."),
    storefrontUrl: String(setting.storefrontUrl || ""),
    trackerToken: String(setting.trackerToken || ""),
  };
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const setting = await prisma.cartReminderSetting.upsert({
    where: { shop: session.shop },
    create: { shop: session.shop, storefrontUrl: `https://${session.shop}` },
    update: {},
  });
  return json({
    shop: session.shop,
    setting: toSettingDTO(setting),
    appUrl: process.env.SHOPIFY_APP_URL || "",
    saved: url.searchParams.get("saved") === "1",
    savedAt: url.searchParams.get("savedAt") || null,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const data = {
    isEnabled: bool(form.get("isEnabled")),
    loggedInCartEnabled: bool(form.get("loggedInCartEnabled")),
    abandonedCheckoutEnabled: bool(form.get("abandonedCheckoutEnabled")),
    autoCartSyncEnabled: bool(form.get("autoCartSyncEnabled")),
    daysAfter: Math.max(1, Math.min(90, intValue(form.get("daysAfter"), 7))),
    dailySendHour: Math.max(0, Math.min(23, intValue(form.get("dailySendHour"), 9))),
    timezone: text(form.get("timezone"), "America/Toronto"),
    fromName: text(form.get("fromName"), "One Wholesale"),
    subject: text(form.get("subject"), "You left items in your cart"),
    headline: text(form.get("headline"), "Your cart is waiting"),
    bodyText: text(form.get("bodyText"), "You left some items in your cart. You can continue where you left off below."),
    buttonText: text(form.get("buttonText"), "Return to cart"),
    footerText: text(form.get("footerText"), "You can unsubscribe from marketing emails anytime."),
    storefrontUrl: text(form.get("storefrontUrl"), `https://${session.shop}`),
  };

  await prisma.cartReminderSetting.upsert({
    where: { shop: session.shop },
    create: { shop: session.shop, ...data },
    update: data,
  });

  const url = new URL(request.url);
  const params = new URLSearchParams(url.search);
  params.set("saved", "1");
  params.set("savedAt", new Date().toISOString());
  return redirect(`/app/settings?${params.toString()}`);
}

function Panel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <Card>
      <BlockStack gap="400">
        <div>
          <Text as="h2" variant="headingMd">{title}</Text>
          <Text as="p" tone="subdued">{description}</Text>
        </div>
        {children}
      </BlockStack>
    </Card>
  );
}

function NativeCheckbox({ name, label, help, defaultChecked, warning }: { name: string; label: string; help?: string; defaultChecked: boolean; warning?: boolean }) {
  return (
    <label style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: 14, border: `1px solid ${warning ? "#fed7aa" : "#e5e7eb"}`, borderRadius: 12, background: warning ? "#fff7ed" : "#fff" }}>
      <input name={name} type="checkbox" defaultChecked={defaultChecked} style={{ marginTop: 3, width: 18, height: 18 }} />
      <span>
        <span style={{ display: "block", fontWeight: 700 }}>{label}</span>
        {help ? <span style={{ display: "block", color: "#6b7280", fontSize: 13, marginTop: 3 }}>{help}</span> : null}
      </span>
    </label>
  );
}

function Field({ label, name, defaultValue, type = "text", min, max, multiline, help }: { label: string; name: string; defaultValue: string | number; type?: string; min?: number; max?: number; multiline?: boolean; help?: string }) {
  const commonStyle: React.CSSProperties = { width: "100%", padding: "10px 12px", border: "1px solid #9ca3af", borderRadius: 10, fontSize: 14, background: "#fff" };
  return (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>{label}</span>
      {multiline ? (
        <textarea name={name} defaultValue={String(defaultValue)} rows={4} style={{ ...commonStyle, resize: "vertical" }} />
      ) : (
        <input name={name} type={type} min={min} max={max} defaultValue={String(defaultValue)} style={commonStyle} />
      )}
      {help ? <span style={{ display: "block", color: "#6b7280", fontSize: 12, marginTop: 5 }}>{help}</span> : null}
    </label>
  );
}

function CodeBox({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: 12, border: "1px solid #e5e7eb", borderRadius: 12, background: "#f8fafc" }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{label}</div>
      <code style={{ display: "block", overflowWrap: "anywhere", fontSize: 12, lineHeight: 1.5 }}>{value || "Not set"}</code>
    </div>
  );
}

export default function SettingsPage() {
  const { setting, appUrl, shop, saved, savedAt } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isSaving = navigation.state === "submitting";

  return (
    <BlockStack gap="500">
      <section>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
          <BlockStack gap="150">
            <Text as="h1" variant="headingLg">Settings</Text>
            <Text as="p" tone="subdued">Store-specific settings for {shop}. This page uses native form inputs so every Save writes directly to the database.</Text>
          </BlockStack>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Badge tone={setting.isEnabled ? "success" : "critical"}>{setting.isEnabled ? "App enabled" : "App disabled"}</Badge>
            <Badge tone={setting.autoCartSyncEnabled ? "attention" : "info"}>{setting.autoCartSyncEnabled ? "Auto sync ON" : "Casper-safe mode"}</Badge>
          </div>
        </div>
      </section>

      {saved ? <Banner tone="success">Settings saved successfully{savedAt ? ` at ${new Date(savedAt).toLocaleString("en-CA", { timeZone: "America/Toronto" })}` : ""}.</Banner> : null}

      <Form method="post" reloadDocument={false}>
        <BlockStack gap="500">
          <InlineGrid columns={{ xs: 1, lg: 2 }} gap="400">
            <Panel title="Reminder controls" description="Turn each feature on/off. Keep auto sync OFF while Casper is active.">
              <div style={{ display: "grid", gap: 12 }}>
                <NativeCheckbox name="isEnabled" label="Enable this app" defaultChecked={setting.isEnabled} />
                <NativeCheckbox name="loggedInCartEnabled" label="Logged-in customer cart tracking / reminder" defaultChecked={setting.loggedInCartEnabled} />
                <NativeCheckbox name="abandonedCheckoutEnabled" label="Abandoned checkout reminder" defaultChecked={setting.abandonedCheckoutEnabled} />
                <NativeCheckbox name="autoCartSyncEnabled" label="Auto cart sync / merge on login" defaultChecked={setting.autoCartSyncEnabled} warning help="Keep OFF while Casper is still running. Turn ON only after Casper is disabled." />
              </div>
            </Panel>

            <Panel title="Schedule and store" description="Used by the reminder cron job and email buttons.">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }}>
                <Field label="Send after how many days" name="daysAfter" type="number" min={1} max={90} defaultValue={setting.daysAfter} />
                <Field label="Daily send hour" name="dailySendHour" type="number" min={0} max={23} defaultValue={setting.dailySendHour} help="0-23 hour format" />
              </div>
              <Field label="Timezone" name="timezone" defaultValue={setting.timezone} />
              <Field label="Storefront URL" name="storefrontUrl" defaultValue={setting.storefrontUrl || `https://${shop}`} />
            </Panel>
          </InlineGrid>

          <InlineGrid columns={{ xs: 1, lg: 3 }} gap="400">
            <div style={{ gridColumn: "span 2" }}>
              <Panel title="Email template" description="Reminder emails now include cart contents automatically under this message.">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }}>
                  <Field label="From name" name="fromName" defaultValue={setting.fromName} />
                  <Field label="Subject" name="subject" defaultValue={setting.subject} />
                </div>
                <Field label="Headline" name="headline" defaultValue={setting.headline} />
                <Field label="Body text" name="bodyText" defaultValue={setting.bodyText} multiline />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }}>
                  <Field label="Button text" name="buttonText" defaultValue={setting.buttonText} />
                  <Field label="Footer / consent note" name="footerText" defaultValue={setting.footerText} multiline />
                </div>
              </Panel>
            </div>

            <Panel title="Theme app embed setup" description="Copy these values into Online Store → Themes → Customize → App embeds.">
              <CodeBox label="App URL" value={appUrl} />
              <CodeBox label="Tracker token" value={setting.trackerToken} />
              <div style={{ padding: 12, borderRadius: 12, background: "#eff6ff", border: "1px solid #bfdbfe" }}>
                <Text as="p">After updating the Theme App Embed, test by logging in as a storefront customer and adding products to cart.</Text>
              </div>
            </Panel>
          </InlineGrid>

          <div style={{ position: "sticky", bottom: 0, background: "#f6f6f7", padding: "14px 0", borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button type="submit" disabled={isSaving} style={{ appearance: "none", border: 0, borderRadius: 10, padding: "12px 20px", background: "#111827", color: "#fff", fontWeight: 800, cursor: isSaving ? "wait" : "pointer" }}>
              {isSaving ? "Saving..." : "Save settings"}
            </button>
          </div>
        </BlockStack>
      </Form>
    </BlockStack>
  );
}
