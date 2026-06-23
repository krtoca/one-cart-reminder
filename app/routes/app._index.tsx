import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Badge, BlockStack, Button, Card, InlineGrid, Layout, Page, Text } from "@shopify/polaris";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const [setting, cartsReady, checkoutsReady, sentLogs, failedLogs] = await Promise.all([
    prisma.cartReminderSetting.findUnique({ where: { shop } }),
    prisma.customerCart.count({ where: { shop, reminderSentAt: null, orderedAt: null } }),
    prisma.abandonedCheckoutReminder.count({ where: { shop, reminderSentAt: null, checkoutCompletedAt: null } }),
    prisma.reminderEmailLog.count({ where: { shop, ok: true } }),
    prisma.reminderEmailLog.count({ where: { shop, ok: false } }),
  ]);
  return { shop, setting, cartsReady, checkoutsReady, sentLogs, failedLogs };
}

export default function Dashboard() {
  const data = useLoaderData<typeof loader>();
  return (
    <Page title="Cart Reminder" subtitle={data.shop}>
      <Layout>
        <Layout.Section>
          <InlineGrid columns={{ xs: 1, md: 4 }} gap="400">
            <Card><BlockStack gap="200"><Text as="p" tone="subdued">Logged-in carts pending</Text><Text as="h2" variant="headingLg">{data.cartsReady}</Text></BlockStack></Card>
            <Card><BlockStack gap="200"><Text as="p" tone="subdued">Abandoned checkouts pending</Text><Text as="h2" variant="headingLg">{data.checkoutsReady}</Text></BlockStack></Card>
            <Card><BlockStack gap="200"><Text as="p" tone="subdued">Emails sent</Text><Text as="h2" variant="headingLg">{data.sentLogs}</Text></BlockStack></Card>
            <Card><BlockStack gap="200"><Text as="p" tone="subdued">Failed logs</Text><Text as="h2" variant="headingLg">{data.failedLogs}</Text></BlockStack></Card>
          </InlineGrid>
        </Layout.Section>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Status</Text>
              <Badge tone={data.setting?.isEnabled ? "success" : "critical"}>{data.setting?.isEnabled ? "Enabled" : "Disabled"}</Badge>
              <Text as="p">Reminder delay: {data.setting?.daysAfter || 7} days</Text>
              <Text as="p">Tracker token is available in Settings. Add the theme app embed to capture logged-in customer carts.</Text>
              <Button url="/app/cart-history">View last 30 days cart history</Button>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
