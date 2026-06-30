const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "shopify.app.toml");

if (!fs.existsSync(file)) {
  console.error("Missing shopify.app.toml");
  process.exit(1);
}

let src = fs.readFileSync(file, "utf8");

if (!src.includes('topics = [ "orders/create" ]') && !src.includes('topics = ["orders/create"]')) {
  src += `

[[webhooks.subscriptions]]
topics = [ "orders/create" ]
uri = "/webhooks/orders/create"
`;
}

fs.writeFileSync(file, src, "utf8");
console.log("Added orders/create webhook subscription to shopify.app.toml");
