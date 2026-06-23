
const fs = require("fs");
const path = require("path");

const tomlPath = path.join(process.cwd(), "shopify.app.toml");
if (!fs.existsSync(tomlPath)) {
  console.log("shopify.app.toml not found. Skipping TOML scope update.");
  process.exit(0);
}

let src = fs.readFileSync(tomlPath, "utf8");
const needed = ["write_draft_orders", "read_draft_orders"];

src = src.replace(/scopes\s*=\s*"([^"]*)"/, (match, current) => {
  const scopes = current.split(",").map((s) => s.trim()).filter(Boolean);
  for (const scope of needed) {
    if (!scopes.includes(scope)) scopes.push(scope);
  }
  return `scopes = "${scopes.join(",")}"`;
});

fs.writeFileSync(tomlPath, src, "utf8");
console.log("Updated shopify.app.toml draft order scopes if access_scopes existed.");
console.log("Also update local .env and Render SCOPES manually to include write_draft_orders,read_draft_orders.");
