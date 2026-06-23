# Changelog

## 2026-06-23

- Fixed TypeScript errors for Polaris `TextField` by using controlled `value/onChange` fields.
- Fixed Shopify Remix document headers function for the installed `@shopify/shopify-app-remix` package.
- Replaced hardcoded `ApiVersion.April26` with configurable `SHOPIFY_API_VERSION` fallback so older packages compile.
- Added explicit multi-store support notes in the embedded app settings.
- Added per-store `autoCartSyncEnabled` setting. Keep this OFF while Casper is active.
- Added `/api/cart/sync` and theme app embed logic for add-only automatic cart merge when auto sync is enabled.
- Confirmed all cart, checkout, settings, email log, and reminder queries are scoped by `shop`.

## Typecheck compatibility fix
- Removed route-level `headers` export from `app/routes/app.tsx` because the installed Remix `HeadersArgs` type does not expose `request`.
- This fixes `TS2339: Property request does not exist on type HeadersArgs`.
