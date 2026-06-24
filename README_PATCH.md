# Cart History Draft Order + Customer Name Fix

## Files included

- `app/routes/app.cart-history.tsx`
- `update-draft-order-scopes.cjs`

## What changed

### Cart History customer display
Collapsed rows now show customer name first.

Priority:

1. Shopify customer display name
2. Shopify customer first/last name
3. email prefix fallback

The email is still visible only after expanding a row.

### Create draft order
When you expand a cart row, there is now a `Create draft order` button.

It creates a Shopify Draft Order from the cart line items using:

- variant ID
- quantity
- customer ID / email when available
- note and tags for One Cart Reminder

After creation, the page shows an `Open draft order` button.

## Important required scope

Draft order creation requires extra app permission.

Add these scopes:

```text
write_draft_orders,read_draft_orders
```

### Local `.env`

Update `SCOPES`:

```env
SCOPES=read_products,read_orders,read_customers,write_customers,read_checkouts,write_draft_orders,read_draft_orders
```

### Render Environment Variables

Update Render Web Service `SCOPES` with the same value.

### shopify.app.toml

You can run:

```powershell
node .\update-draft-order-scopes.cjs
```

Then deploy Shopify app configuration:

```powershell
npx shopify app deploy
```

Because scopes changed, Shopify may ask you to approve the new permissions on each installed store.

## Apply

Copy the `app` folder and `update-draft-order-scopes.cjs` into your project root.

Then run:

```powershell
node .\update-draft-order-scopes.cjs
npm run typecheck
npm run build
git add app/routes/app.cart-history.tsx shopify.app.toml update-draft-order-scopes.cjs
git commit -m "Add cart history draft order creation"
git push
npx shopify app deploy
```

After Render auto-deploy finishes, reopen the app in Shopify Admin.
