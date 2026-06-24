
const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "app", "routes", "app.cart-history.tsx");
if (!fs.existsSync(file)) {
  console.error("Missing file:", file);
  process.exit(1);
}

let src = fs.readFileSync(file, "utf8");

// Replace the generic Open cart / recovery link button with recovery-only logic.
// Logged-in cart URL is only the current browser/customer cart and should not be opened by admin.
src = src.replace(
  /\{row\.url \? <Button url=\{row\.url\} target="_blank">Open cart \/ recovery link<\/Button> : null\}/g,
  `{row.source === "Abandoned checkout" && row.url ? (
              <Button url={row.url} target="_blank">Open recovery link</Button>
            ) : null}`
);

// If the generated file used slightly different text, handle common variants.
src = src.replace(
  /\{row\.url \? <Button url=\{row\.url\} target="_blank">Open cart<\/Button> : null\}/g,
  `{row.source === "Abandoned checkout" && row.url ? (
              <Button url={row.url} target="_blank">Open recovery link</Button>
            ) : null}`
);

src = src.replace(
  /\{row\.url \? <Button url=\{row\.url\} target="_blank">Open recovery link<\/Button> : null\}/g,
  `{row.source === "Abandoned checkout" && row.url ? (
              <Button url={row.url} target="_blank">Open recovery link</Button>
            ) : null}`
);

// Add a helpful note for logged-in carts in expanded details, if not already present.
if (!src.includes("Logged-in cart links are not customer recovery links")) {
  src = src.replace(
    /<ItemList items=\{row\.items\} currencyCode=\{row\.currencyCode\} \/>/,
    `{row.source === "Logged-in cart" ? (
          <p style={{ margin: "0 0 10px", color: "#6b7280", fontSize: 13 }}>
            Logged-in cart links are not customer recovery links. Use Create draft order for admin follow-up.
          </p>
        ) : null}
        <ItemList items={row.items} currencyCode={row.currencyCode} />`
  );
}

fs.writeFileSync(file, src, "utf8");
console.log("Patched recovery link behavior:", file);
