# One Cart Reminder App

A separate Shopify embedded app for two reminder flows:

1. **Logged-in customer cart reminder**  
   Uses a Shopify theme app embed to capture `/cart.js` only when the storefront visitor is logged in and Liquid exposes `customer.email`.

2. **Abandoned checkout reminder**  
   Uses Shopify Admin GraphQL `abandonedCheckouts` to find checkouts where the customer added contact information but did not complete purchase.

The app does **not** modify One Marketplace. It is a standalone Shopify embedded app with its own database tables and cron endpoint.

## Important Shopify notes

- `abandonedCheckouts` requires `read_orders` access and the Shopify admin user needs abandoned checkout permissions.
- Shopify's abandoned checkout object includes `abandonedCheckoutUrl`, `completedAt`, `createdAt`, `customer`, `lineItems`, and pricing fields.
- A pure cart-only reminder cannot email guest visitors unless you already know their email. This app captures only logged-in customer carts for that reason.

## Install / local setup

```bash
npm install
cp .env.example .env
npx prisma generate
npx prisma migrate dev
shopify app dev
```

## Render setup

Set environment variables:

```bash
DATABASE_URL=...
SHOPIFY_API_KEY=...
SHOPIFY_API_SECRET=...
SHOPIFY_APP_URL=https://your-render-service.onrender.com
SCOPES=read_orders,read_customers,read_checkouts,write_marketing_events
SMTP_HOST=smtp.sendpulse.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=no-reply@yourdomain.com
CRON_SECRET=your-long-secret
```

Build command:

```bash
npm install && npm run setup && npm run build
```

Start command:

```bash
npm run start
```

## Cron

Recommended Render Cron:

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://your-render-service.onrender.com/api/cron/reminders
```

Run daily or hourly. The app stores `daysAfter` in Settings. Default is 7 days.

Manual test:

```bash
npm run reminders:run
npm run reminders:run -- --shop=onetradingltd.myshopify.com
```

## Theme app embed setup

After the app is installed:

1. Open Shopify Admin → Online Store → Themes → Customize.
2. Open **App embeds**.
3. Enable **Cart Reminder Tracker**.
4. In the embedded app Admin → Settings, copy:
   - App URL
   - Tracker token
5. Paste them into the app embed settings.
6. Save theme.

## Email behavior

The app sends one reminder per captured source record:

- `LOGGED_IN_CART`
- `ABANDONED_CHECKOUT`

Before sending logged-in cart reminders, it checks whether that customer email has an order after the cart capture time. If yes, it marks the cart as ordered and skips the email.

## Files to review

- `app/services/reminder-runner.server.ts` — main reminder logic
- `app/services/abandoned-checkout.server.ts` — abandoned checkout sync
- `app/services/cart-capture.server.ts` — logged-in cart capture
- `extensions/cart-reminder-theme/blocks/cart-reminder-tracker.liquid` — storefront tracker
- `app/routes/api.cron.reminders.tsx` — Render Cron endpoint
- `app/routes/api.cart.capture.tsx` — cart capture endpoint

## Safety / compliance

Make sure marketing consent and unsubscribe handling are aligned with your store's policy and CASL requirements. This starter sends only to logged-in customers or customers who entered checkout contact information, but you should connect it with your marketing consent rules before large-scale sending.

## Admin cart history

The embedded admin now includes **Cart history** at `/app/cart-history`.

Default view:

- Last 30 days
- Logged-in customer cart captures
- Abandoned checkout records synced from Shopify
- Customer email
- Cart item title, variant, SKU, quantity, price
- Cart subtotal / checkout total
- Reminder status
- Reminder sent time
- Cart or abandoned checkout recovery URL

The date range can be changed from 1 to 90 days in the page filter. The page reads from the app database only, so logged-in cart contents appear after the theme app embed has captured the cart, and abandoned checkout contents appear after the cron/sync has imported abandoned checkouts from Shopify.


## Multi-store behavior

This app is designed for multiple Shopify stores. One Render app and one PostgreSQL database can serve multiple stores. Data is separated by the Shopify `shop` domain.

Separated per store:

- Admin session / offline token
- Cart Reminder settings
- Tracker token
- Logged-in cart records
- Abandoned checkout records
- Reminder email logs
- Auto cart sync setting

Important: each store must enable the theme app embed separately and use that store's own tracker token from **App → Settings**. Do not copy one store's tracker token to another store.

## Casper coexistence mode

While Casper is still installed, use this safe setting:

```text
Cart tracking: ON
Auto cart sync / merge on login: OFF
Reminder email: OFF initially, then ON after testing
```

This lets the new app collect 30 days of cart data without changing the customer's live cart. After Casper is disabled, turn **Auto cart sync / merge on login** ON.

## Local Render PostgreSQL note

When running Prisma from your Windows PowerShell against Render PostgreSQL, use the **External Database URL** and make sure it includes SSL if needed:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DBNAME?schema=public&sslmode=require"
```

If your copied URL already has `?schema=public`, append SSL as `&sslmode=require`. If it has no query string, append `?schema=public&sslmode=require`.

Then run:

```powershell
npx prisma generate
npx prisma migrate dev
npm run typecheck
npm run build
```
