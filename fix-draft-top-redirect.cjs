
const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "app", "routes", "app.cart-history.tsx");
if (!fs.existsSync(file)) {
  console.error("Missing file:", file);
  process.exit(1);
}

let src = fs.readFileSync(file, "utf8");

// Add helper function before action if not already present.
if (!src.includes("function topLevelAdminRedirectResponse")) {
  const helper = `
function topLevelAdminRedirectResponse(targetUrl: string) {
  const safeTarget = JSON.stringify(targetUrl);
  return new Response(
    \`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Opening draft order...</title>
    <script>
      (function () {
        var target = \${safeTarget};
        try {
          if (window.top) {
            window.top.location.href = target;
          } else {
            window.location.href = target;
          }
        } catch (error) {
          window.location.href = target;
        }
      })();
    </script>
  </head>
  <body style="font-family: Arial, sans-serif; padding: 24px;">
    <p>Opening draft order...</p>
    <p><a href="\${targetUrl}" target="_top" rel="noreferrer">Click here if it does not open automatically.</a></p>
  </body>
</html>\`,
    {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    },
  );
}

`;
  src = src.replace(/export async function action\(/, helper + "export async function action(");
}

// Replace direct redirect(draftUrl) with top-level admin redirect response.
// Direct redirect inside embedded iframe causes Shopify blocked/forbidden icon.
src = src.replace(
  /if\s*\(draftUrl\)\s*\{\s*return redirect\(draftUrl\);\s*\}/g,
  `if (draftUrl) {
    return topLevelAdminRedirectResponse(draftUrl);
  }`
);

// If redirect import is now unused, it is okay but remove it to avoid lint/type issues in stricter setups.
src = src.replace(
  /import\s*\{\s*json,\s*redirect\s*\}\s*from\s*"@remix-run\/node";/,
  `import { json } from "@remix-run/node";`
);
src = src.replace(
  /import\s*\{\s*redirect,\s*json\s*\}\s*from\s*"@remix-run\/node";/,
  `import { json } from "@remix-run/node";`
);

fs.writeFileSync(file, src, "utf8");
console.log("Patched draft order top-level redirect:", file);
