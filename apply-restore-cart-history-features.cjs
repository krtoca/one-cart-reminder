const fs = require("fs");
const path = require("path");

const source = path.join(__dirname, "app", "routes", "app.cart-history.tsx");
const target = path.join(process.cwd(), "app", "routes", "app.cart-history.tsx");

if (!fs.existsSync(source)) {
  console.error("Missing source file:", source);
  process.exit(1);
}
if (!fs.existsSync(path.dirname(target))) {
  console.error("Missing target folder:", path.dirname(target));
  process.exit(1);
}

fs.copyFileSync(target, `${target}.bak-${Date.now()}`);
fs.copyFileSync(source, target);
console.log("Restored Cart History features:", target);
