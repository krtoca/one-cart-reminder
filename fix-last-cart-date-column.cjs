
const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "app", "routes", "app.cart-history.tsx");
if (!fs.existsSync(file)) {
  console.error("Missing file:", file);
  process.exit(1);
}

let src = fs.readFileSync(file, "utf8");

const oldCols = 'gridTemplateColumns: "minmax(220px, 1.4fr) 120px 140px 160px 160px 130px"';
const newCols = 'gridTemplateColumns: "minmax(220px, 1.4fr) 110px 130px 170px 130px 170px 120px"';

src = src.split(oldCols).join(newCols);

// Add recent cart date value in row, between Cart total and Orders.
src = src.replace(
  /<div>\{money\(row\.total, row\.currencyCode\)\}<\/div>\s*<div>\{row\.orderCount === null \? "-" : `\$\{row\.orderCount\} order\$\{row\.orderCount === 1 \? "" : "s"\}`\}<\/div>/,
  `<div>{money(row.total, row.currencyCode)}</div>
          <div>{dateText(row.capturedAt)}</div>
          <div>{row.orderCount === null ? "-" : \`\${row.orderCount} order\${row.orderCount === 1 ? "" : "s"}\`}</div>`
);

// Add recent cart date header, between Cart total and Orders.
src = src.replace(
  /<div>Cart total<\/div>\s*<div>Orders<\/div>/,
  `<div>Cart date</div>
                  <div>Orders</div>`
);

// The previous replacement removed Cart total header accidentally if exact spacing differs.
// Ensure header still includes Cart total followed by Cart date.
src = src.replace(
  /<div>Items<\/div>\s*<div>Cart date<\/div>/,
  `<div>Items</div>
                  <div>Cart total</div>
                  <div>Cart date</div>`
);

// If the exact row pattern did not match, use a safer fallback.
if (!src.includes("<div>{dateText(row.capturedAt)}</div>")) {
  src = src.replace(
    /<div>\{money\(row\.total, row\.currencyCode\)\}<\/div>/,
    `<div>{money(row.total, row.currencyCode)}</div>
          <div>{dateText(row.capturedAt)}</div>`
  );
}

// If header fallback needed.
if (!src.includes("<div>Cart date</div>")) {
  src = src.replace(
    /<div>Cart total<\/div>/,
    `<div>Cart total</div>
                  <div>Cart date</div>`
  );
}

// Update min width to fit 7 columns.
src = src.replace(/minWidth:\s*1080/g, "minWidth: 1220");
src = src.replace(/minWidth:\s*900/g, "minWidth: 1220");

fs.writeFileSync(file, src, "utf8");
console.log("Patched Cart History last cart date column:", file);
