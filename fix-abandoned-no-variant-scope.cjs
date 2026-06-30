
const fs = require("fs");
const path = require("path");

const candidates = [
  path.join(process.cwd(), "app", "services", "abandoned-checkout.server.ts"),
  path.join(process.cwd(), "app", "services", "abandoned-checkouts.server.ts"),
  path.join(process.cwd(), "app", "services", "abandoned-checkout-sync.server.ts"),
];

const file = candidates.find((candidate) => fs.existsSync(candidate));

if (!file) {
  console.error("Could not find abandoned checkout service file.");
  console.error("Checked:");
  for (const candidate of candidates) console.error(" -", candidate);
  process.exit(1);
}

let src = fs.readFileSync(file, "utf8");

// Remove GraphQL variant object blocks from abandoned checkout query.
// The variant field requires read_products. Abandoned checkout sync should not fail if that scope is not approved.
src = src.replace(
  /\s+variant\s*\{\s*id\s*sku\s*title\s*\}/g,
  ""
);

src = src.replace(
  /\s+variant\s*\{\s*id\s*title\s*sku\s*\}/g,
  ""
);

src = src.replace(
  /\s+variant\s*\{\s*id\s*sku\s*\}/g,
  ""
);

src = src.replace(
  /\s+variant\s*\{\s*id\s*title\s*\}/g,
  ""
);

// Also remove mappings that assume item.variant exists, replacing with null-safe fallback.
src = src.replace(/variantId:\s*item\.variant\?\.id\s*\|\|\s*[^,\n]+/g, "variantId: null");
src = src.replace(/variantId:\s*lineItem\.variant\?\.id\s*\|\|\s*[^,\n]+/g, "variantId: null");

src = src.replace(/sku:\s*item\.variant\?\.sku\s*\|\|\s*[^,\n]+/g, "sku: null");
src = src.replace(/sku:\s*lineItem\.variant\?\.sku\s*\|\|\s*[^,\n]+/g, "sku: null");

src = src.replace(/variantTitle:\s*item\.variant\?\.title\s*\|\|\s*[^,\n]+/g, "variantTitle: null");
src = src.replace(/variantTitle:\s*lineItem\.variant\?\.title\s*\|\|\s*[^,\n]+/g, "variantTitle: null");

// If the service still reports GraphQL errors by throwing, make the error shorter/readable where possible.
src = src.replace(
  /throw new Error\(`Shopify GraphQL failed for \$\{shop\}: \$\{JSON\.stringify\(payload\.errors\)\}`\);/g,
  `throw new Error(\`Shopify GraphQL failed for \${shop}: \${payload.errors?.map((error) => error.message).join("; ") || "Unknown GraphQL error"}\`);`
);

fs.writeFileSync(file, src, "utf8");

console.log("Patched abandoned checkout sync to avoid variant field/read_products dependency:");
console.log(file);
