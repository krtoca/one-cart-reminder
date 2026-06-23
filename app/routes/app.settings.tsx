import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import { Banner, BlockStack, Button, Card, Checkbox, Layout, Page, Text, TextField } from "@shopify/polaris";
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
  const setting = await prisma.cartReminderSetting.upsert({
    where: { shop: session.shop },
    create: { shop: session.shop, storefrontUrl: `https://${session.shop}` },
    update: {},
  });
  return json({ shop: session.shop, setting, appUrl: process.env.SHOPIFY_APP_URL || "" });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  await prisma.cartReminderSetting.update({
    where: { shop: session.shop },
    data: {
      isEnabled: bool(form.get("isEnabled")),
      loggedInCartEnabled: bool(form.get("loggedInCartEnabled")),
      abandonedCheckoutEnabled: bool(form.get("abandonedCheckoutEnabled")),
      autoCartSyncEnabled: bool(form.get("autoCartSyncEnabled")),
      daysAfter: intValue(form.get("daysAfter"), 7),
      dailySendHour: intValue(form.get("dailySendHour"), 9),
      timezone: text(form.get("timezone"), "America/Toronto"),
      fromName: text(form.get("fromName"), "One Wholesale"),
      subject: text(form.get("subject"), "You left items in your cart"),
      headline: text(form.get("headline"), "Your cart is waiting"),
      bodyText: text(form.get("bodyText"), "You left some items in your cart. You can continue where you left off below."),
      buttonText: text(form.get("buttonText"), "Return to cart"),
      footerText: text(form.get("footerText"), "You can unsubscribe from marketing emails anytime."),
      storefrontUrl: text(form.get("storefrontUrl"), `https://${session.shop}`),
    },
  });
  return redirect("/app/settings?saved=1");
}

export default function SettingsPage() {
  const { setting, appUrl, shop } = useLoaderData<typeof loader>();
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
    <Page title="Settings" subtitle="Each Shopify store has its own separate settings, tracker token, cart data, and reminder logs.">
      <Layout>
        <Layout.Section>
          <Form method="post">
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Reminder controls</Text>
                  <Banner tone="info">Multi-store ready: this page only changes settings for {shop}. Other installed stores are not affected.</Banner>
                  <Checkbox label="Enable this app" name="isEnabled" checked={isEnabled} onChange={setIsEnabled} />
                  <Checkbox label="Logged-in customer cart tracking / reminder" name="loggedInCartEnabled" checked={loggedInCartEnabled} onChange={setLoggedInCartEnabled} />
                  <Checkbox label="Abandoned checkout reminder" name="abandonedCheckoutEnabled" checked={abandonedCheckoutEnabled} onChange={setAbandonedCheckoutEnabled} />
                  <Checkbox label="Auto cart sync / merge on login" name="autoCartSyncEnabled" checked={autoCartSyncEnabled} onChange={setAutoCartSyncEnabled} helpText="Keep OFF while Casper is still running. Turn ON after Casper is disabled." />
                  <TextField label="Send after how many days" name="daysAfter" type="number" min={1} value={daysAfter} onChange={setDaysAfter} autoComplete="off" />
                  <TextField label="Daily send hour" name="dailySendHour" type="number" min={0} max={23} value={dailySendHour} onChange={setDailySendHour} autoComplete="off" helpText="Use this with your Render Cron schedule. Recommended: run cron hourly or daily." />
                  <TextField label="Timezone" name="timezone" value={timezone} onChange={setTimezone} autoComplete="off" />
                  <TextField label="Storefront URL" name="storefrontUrl" value={storefrontUrl} onChange={setStorefrontUrl} autoComplete="off" />
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Email template</Text>
                  <TextField label="From name" name="fromName" value={fromName} onChange={setFromName} autoComplete="off" />
                  <TextField label="Subject" name="subject" value={subject} onChange={setSubject} autoComplete="off" />
                  <TextField label="Headline" name="headline" value={headline} onChange={setHeadline} autoComplete="off" />
                  <TextField label="Body text" name="bodyText" value={bodyText} onChange={setBodyText} multiline={4} autoComplete="off" />
                  <TextField label="Button text" name="buttonText" value={buttonText} onChange={setButtonText} autoComplete="off" />
                  <TextField label="Footer / consent note" name="footerText" value={footerText} onChange={setFooterText} multiline={3} autoComplete="off" />
                </BlockStack>
              </Card>

              <Button submit variant="primary">Save settings</Button>
            </BlockStack>
          </Form>
        </Layout.Section>
        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Theme app embed setup</Text>
              <Banner tone="info">
                Install and enable the app embed in Online Store → Customize → App embeds for each store that should be tracked.
              </Banner>
              <Text as="p">Current store</Text>
              <Text as="p" tone="subdued">{shop}</Text>
              <Text as="p">App URL</Text>
              <Text as="p" tone="subdued">{appUrl || "Set SHOPIFY_APP_URL in Render"}</Text>
              <Text as="p">Tracker token for this store</Text>
              <Text as="p" tone="subdued">{setting.trackerToken}</Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
