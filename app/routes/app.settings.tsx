import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useNavigation } from "@remix-run/react";
import { Badge, Banner, BlockStack, Button, Card, Checkbox, InlineGrid, Text, TextField } from "@shopify/polaris";
import { useState } from "react";
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

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const setting = await prisma.cartReminderSetting.upsert({
    where: { shop: session.shop },
    create: { shop: session.shop, storefrontUrl: `https://${session.shop}` },
    update: {},
  });
  return json({ shop: session.shop, setting, appUrl: process.env.SHOPIFY_APP_URL || "", saved: url.searchParams.get("saved") === "1" });
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

  // Use upsert so the Save button still works even if the settings row was not created yet.
  await prisma.cartReminderSetting.upsert({
    where: { shop: session.shop },
    create: { shop: session.shop, ...data },
    update: data,
  });

  // Preserve Shopify embedded app query params (host/shop) so save/back/navigation does not land on a raw 200 page.
  const url = new URL(request.url);
  const params = new URLSearchParams(url.search);
  params.set("saved", "1");
  return redirect(`/app/settings?${params.toString()}`);
}

function SettingPanel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
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

function TokenBox({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: 12, border: "1px solid #e5e7eb", borderRadius: 12, background: "#f8fafc" }}>
      <BlockStack gap="100">
        <Text as="p" fontWeight="semibold">{label}</Text>
        <code style={{ display: "block", overflowWrap: "anywhere", fontSize: 12, lineHeight: 1.5 }}>{value}</code>
      </BlockStack>
    </div>
  );
}

export default function SettingsPage() {
  const { setting, appUrl, shop, saved } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isSaving = navigation.state === "submitting";
  const [isEnabled, setIsEnabled] = useState(setting.isEnabled);
  const [loggedInCartEnabled, setLoggedInCartEnabled] = useState(setting.loggedInCartEnabled);
  const [abandonedCheckoutEnabled, setAbandonedCheckoutEnabled] = useState(setting.abandonedCheckoutEnabled);
  const [autoCartSyncEnabled, setAutoCartSyncEnabled] = useState(setting.autoCartSyncEnabled);
  const [daysAfter, setDaysAfter] = useState(String(setting.daysAfter));
  const [dailySendHour, setDailySendHour] = useState(String(setting.dailySendHour));
  const [timezone, setTimezone] = useState(setting.timezone);
  const [storefrontUrl, setStorefrontUrl] = useState(setting.storefrontUrl || `https://${shop}`);
  const [fromName, setFromName] = useState(setting.fromName);
  const [subject, setSubject] = useState(setting.subject);
  const [headline, setHeadline] = useState(setting.headline);
  const [bodyText, setBodyText] = useState(setting.bodyText);
  const [buttonText, setButtonText] = useState(setting.buttonText);
  const [footerText, setFooterText] = useState(setting.footerText);

  return (
    <BlockStack gap="500">
      <section>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
          <BlockStack gap="150">
            <Text as="h1" variant="headingLg">Settings</Text>
            <Text as="p" tone="subdued">Store-specific settings for {shop}</Text>
          </BlockStack>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Badge tone={isEnabled ? "success" : "critical"}>{isEnabled ? "App enabled" : "App disabled"}</Badge>
            <Badge tone={autoCartSyncEnabled ? "attention" : "info"}>{autoCartSyncEnabled ? "Auto sync ON" : "Casper-safe mode"}</Badge>
          </div>
        </div>
      </section>

      {saved ? <Banner tone="success">Settings saved successfully.</Banner> : null}
      <Banner tone="info">If a button shows a raw 200 page or does not update, this version preserves Shopify embedded app parameters and uses a standard HTML submit button for Settings.</Banner>

      <form method="post">
        <BlockStack gap="500">
          <InlineGrid columns={{ xs: 1, lg: 2 }} gap="400">
            <SettingPanel title="Reminder controls" description="Turn features on/off and decide when reminders should be sent.">
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ padding: 14, border: "1px solid #e5e7eb", borderRadius: 12 }}>
                  <Checkbox label="Enable this app" name="isEnabled" checked={isEnabled} onChange={setIsEnabled} />
                </div>
                <div style={{ padding: 14, border: "1px solid #e5e7eb", borderRadius: 12 }}>
                  <Checkbox label="Logged-in customer cart tracking / reminder" name="loggedInCartEnabled" checked={loggedInCartEnabled} onChange={setLoggedInCartEnabled} />
                </div>
                <div style={{ padding: 14, border: "1px solid #e5e7eb", borderRadius: 12 }}>
                  <Checkbox label="Abandoned checkout reminder" name="abandonedCheckoutEnabled" checked={abandonedCheckoutEnabled} onChange={setAbandonedCheckoutEnabled} />
                </div>
                <div style={{ padding: 14, border: "1px solid #fed7aa", borderRadius: 12, background: autoCartSyncEnabled ? "#fff7ed" : "#f8fafc" }}>
                  <Checkbox label="Auto cart sync / merge on login" name="autoCartSyncEnabled" checked={autoCartSyncEnabled} onChange={setAutoCartSyncEnabled} helpText="Keep OFF while Casper is still running. Turn ON after Casper is disabled." />
                </div>
              </div>
            </SettingPanel>

            <SettingPanel title="Schedule and store" description="These values are used by the reminder cron job and email links.">
              <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
                <TextField label="Send after how many days" name="daysAfter" type="number" min={1} value={daysAfter} onChange={setDaysAfter} autoComplete="off" />
                <TextField label="Daily send hour" name="dailySendHour" type="number" min={0} max={23} value={dailySendHour} onChange={setDailySendHour} autoComplete="off" helpText="0-23 hour format." />
              </InlineGrid>
              <TextField label="Timezone" name="timezone" value={timezone} onChange={setTimezone} autoComplete="off" />
              <TextField label="Storefront URL" name="storefrontUrl" value={storefrontUrl} onChange={setStorefrontUrl} autoComplete="off" />
            </SettingPanel>
          </InlineGrid>

          <InlineGrid columns={{ xs: 1, lg: 3 }} gap="400">
            <div style={{ gridColumn: "span 2" }}>
              <SettingPanel title="Email template" description="Text used in cart and abandoned checkout reminder emails.">
                <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
                  <TextField label="From name" name="fromName" value={fromName} onChange={setFromName} autoComplete="off" />
                  <TextField label="Subject" name="subject" value={subject} onChange={setSubject} autoComplete="off" />
                </InlineGrid>
                <TextField label="Headline" name="headline" value={headline} onChange={setHeadline} autoComplete="off" />
                <TextField label="Body text" name="bodyText" value={bodyText} onChange={setBodyText} multiline={4} autoComplete="off" />
                <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
                  <TextField label="Button text" name="buttonText" value={buttonText} onChange={setButtonText} autoComplete="off" />
                  <TextField label="Footer / consent note" name="footerText" value={footerText} onChange={setFooterText} multiline={3} autoComplete="off" />
                </InlineGrid>
              </SettingPanel>
            </div>

            <SettingPanel title="Theme app embed setup" description="Copy these values into the theme app embed settings.">
              <Banner tone="info">Online Store → Themes → Customize → App embeds → Cart Reminder Tracker</Banner>
              <TokenBox label="Current store" value={shop} />
              <TokenBox label="App URL" value={appUrl || "Set SHOPIFY_APP_URL in Render"} />
              <TokenBox label="Tracker token" value={setting.trackerToken} />
            </SettingPanel>
          </InlineGrid>

          <div style={{ position: "sticky", bottom: 0, zIndex: 5, padding: "12px 0", background: "linear-gradient(180deg, rgba(243,244,246,0), #f3f4f6 35%)" }}>
            <Card>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                <Text as="p" tone="subdued">Changes apply only to this Shopify store.</Text>
                <button
                  type="submit"
                  disabled={isSaving}
                  style={{
                    border: 0,
                    borderRadius: 10,
                    padding: "11px 18px",
                    background: isSaving ? "#6b7280" : "#111827",
                    color: "#ffffff",
                    fontWeight: 800,
                    cursor: isSaving ? "not-allowed" : "pointer",
                    minWidth: 132,
                  }}
                >
                  {isSaving ? "Saving..." : "Save settings"}
                </button>
              </div>
            </Card>
          </div>
        </BlockStack>
      </form>
    </BlockStack>
  );
}
