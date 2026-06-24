
const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "app", "routes", "app.cart-history.tsx");
if (!fs.existsSync(file)) {
  console.error("Missing file:", file);
  process.exit(1);
}

let src = fs.readFileSync(file, "utf8");

// 1) Remove target="_top" from Create Draft form.
// Form submission must stay inside the embedded app so authenticate.admin(action) works.
src = src.replace(
  /<Form method="post" action=\{formAction\} target="_top" reloadDocument>/g,
  '<Form method="post" action={formAction} reloadDocument>'
);

// 2) Replace auto top-window redirect success with normal JSON success.
// This keeps draft creation stable and shows an Open draft order button after success.
src = src.replace(
  /if\s*\(draftUrl\)\s*\{\s*return topLevelAdminRedirectResponse\(draftUrl\);\s*\}\s*\n\s*return json<ActionData>\(\{\s*ok:\s*true,\s*message:\s*`Draft order \$\{draft\.name \|\| ""\} was created successfully\.`,\s*draftName:\s*draft\.name \|\| undefined,\s*draftUrl,\s*debug:\s*skippedItems\.length \? `Skipped \$\{skippedItems\.length\} item\(s\) without Shopify variant ID\.` : undefined,\s*\}\);/s,
  `return json<ActionData>({
    ok: true,
    message: \`Draft order \${draft.name || ""} was created successfully.\`,
    draftName: draft.name || undefined,
    draftUrl,
    debug: skippedItems.length ? \`Skipped \${skippedItems.length} item(s) without Shopify variant ID.\` : undefined,
  });`
);

// 3) Fallback replacement for variants of the auto-redirect block.
src = src.replace(
  /if\s*\(draftUrl\)\s*\{\s*return topLevelAdminRedirectResponse\(draftUrl\);\s*\}/g,
  ''
);

// 4) Keep helper function if present. It is unused but harmless; remove to reduce confusion.
src = src.replace(
  /\nfunction topLevelAdminRedirectResponse\(targetUrl: string\) \{[\s\S]*?\n\}\n\nasync function loadCustomerInfo/,
  '\nasync function loadCustomerInfo'
);

// 5) Make Open draft order button use target _blank to avoid replacing the embedded app.
// If _top is preferred later, it can be changed, but _blank is safest.
src = src.replace(
  /<Button url=\{actionData\.draftUrl\} target="_top">Open draft order<\/Button>/g,
  '<Button url={actionData.draftUrl} target="_blank">Open draft order</Button>'
);

// 6) Add a clearer success note if not already present.
src = src.replace(
  /<Button url=\{actionData\.draftUrl\} target="_blank">Open draft order<\/Button>/g,
  '<Button url={actionData.draftUrl} target="_blank">Open draft order</Button>'
);

fs.writeFileSync(file, src, "utf8");
console.log("Patched draft creation to stable no-auto-redirect mode:", file);
