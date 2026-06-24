
const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "app", "routes", "app.cart-history.tsx");
if (!fs.existsSync(file)) {
  console.error("Missing file:", file);
  process.exit(1);
}

let src = fs.readFileSync(file, "utf8");

// Make sure redirect is imported from @remix-run/node.
src = src.replace(
  /import\s*\{([^}]+)\}\s*from\s*"@remix-run\/node";/,
  (match, imports) => {
    const parts = imports.split(",").map((s) => s.trim()).filter(Boolean);
    if (!parts.includes("redirect")) parts.push("redirect");
    return `import { ${parts.join(", ")} } from "@remix-run/node";`;
  }
);

// Replace the success JSON response with redirect to Shopify Admin draft order page.
// This targets the generated action success block after draftUrl is computed.
src = src.replace(
  /return json<ActionData>\(\{\s*ok:\s*true,\s*message:\s*`Draft order \$\{draft\.name \|\| ""\} was created successfully\.`,\s*draftName:\s*draft\.name \|\| undefined,\s*draftUrl,\s*\}\);/s,
  `if (draftUrl) {
    return redirect(draftUrl);
  }

  return json<ActionData>({
    ok: true,
    message: \`Draft order \${draft.name || ""} was created successfully, but the Shopify Admin URL was not available.\`,
    draftName: draft.name || undefined,
    draftUrl,
  });`
);

// Fallback for slightly different spacing or message.
src = src.replace(
  /return json<ActionData>\(\{\s*ok:\s*true,[\s\S]*?draftUrl,\s*\}\);/s,
  (match) => {
    if (match.includes("return redirect(draftUrl)")) return match;
    return `if (draftUrl) {
    return redirect(draftUrl);
  }

  ${match}`;
  }
);

fs.writeFileSync(file, src, "utf8");
console.log("Patched draft order auto redirect:", file);
