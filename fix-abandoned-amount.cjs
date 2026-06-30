
const fs = require("fs");
const path = require("path");

const root = process.cwd();

function patchAbandonedService() {
  const candidates = [
    path.join(root, "app", "services", "abandoned-checkout.server.ts"),
    path.join(root, "app", "services", "abandoned-checkouts.server.ts"),
    path.join(root, "app", "services", "abandoned-checkout-sync.server.ts"),
  ];

  const file = candidates.find((candidate) => fs.existsSync(candidate));
  if (!file) {
    console.warn("Abandoned checkout service file not found. Skipping service patch.");
    return;
  }

  let src = fs.readFileSync(file, "utf8");

  if (!src.includes("function lineItemsAmount")) {
    src = src.replace(
      /function moneyCurrency\(set: any\) \{[\s\S]*?\n\}/,
      `function moneyCurrency(set: any) {
  return set?.shopMoney?.currencyCode ? String(set.shopMoney.currencyCode) : null;
}

function lineItemsAmount(lineItems: Array<{ quantity?: number | string | null; price?: number | string | null }>) {
  const total = lineItems.reduce((sum, item) => {
    const quantity = Number(item.quantity || 0);
    const price = Number(item.price || 0);
    return Number.isFinite(quantity) && Number.isFinite(price) ? sum + quantity * price : sum;
  }, 0);

  return total > 0 ? Number(total.toFixed(2)) : null;
}`
    );
  }

  // Add computed fallback after itemCount calculation.
  if (!src.includes("const computedTotalPrice = moneyAmount(node.totalPriceSet) ?? lineItemsAmount(lineItems);")) {
    src = src.replace(
      /const itemCount = lineItems\.reduce\(\(sum: number, item: any\) => sum \+ Number\(item\.quantity \|\| 0\), 0\);/,
      `const itemCount = lineItems.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0);
    const computedTotalPrice = moneyAmount(node.totalPriceSet) ?? lineItemsAmount(lineItems);
    const computedCurrencyCode = moneyCurrency(node.totalPriceSet) || lineItems.find((item: any) => item.currencyCode)?.currencyCode || "CAD";`
    );
  }

  // Ensure line item currency is saved where possible.
  src = src.replace(
    /price: item\.originalUnitPriceSet\?\.shopMoney\?\.amount \|\| null,/g,
    `price: item.originalUnitPriceSet?.shopMoney?.amount || null,
      currencyCode: item.originalUnitPriceSet?.shopMoney?.currencyCode || null,`
  );

  // Replace totalPrice/currencyCode assignments with computed values.
  src = src.replace(/totalPrice: moneyAmount\(node\.totalPriceSet\),/g, "totalPrice: computedTotalPrice,");
  src = src.replace(/currencyCode: moneyCurrency\(node\.totalPriceSet\),/g, "currencyCode: computedCurrencyCode,");

  fs.writeFileSync(file, src, "utf8");
  console.log("Patched abandoned checkout amount fallback:", file);
}

function patchCartHistory() {
  const file = path.join(root, "app", "routes", "app.cart-history.tsx");
  if (!fs.existsSync(file)) {
    console.error("Missing:", file);
    process.exit(1);
  }

  let src = fs.readFileSync(file, "utf8");

  if (!src.includes("function lineItemsTotal")) {
    src = src.replace(
      /function money\(value: unknown, currencyCode\?: string \| null\) \{[\s\S]*?\n\}/,
      `function money(value: unknown, currencyCode?: string | null) {
  if (value === null || value === undefined || value === "") return "-";
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return \`\${currencyCode || "CAD"} \${n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\`;
}

function lineItemsTotal(items: LineItem[]) {
  const total = items.reduce((sum, item) => {
    const quantity = Number(item.quantity || 0);
    const price = Number(item.price || 0);
    return Number.isFinite(quantity) && Number.isFinite(price) ? sum + quantity * price : sum;
  }, 0);

  return Number(total.toFixed(2));
}

function rowAmount(row: Pick<Row, "total" | "items">) {
  const direct = Number(row.total || 0);
  if (Number.isFinite(direct) && direct > 0) return direct;
  return lineItemsTotal(row.items || []);
}`
    );
  }

  // Update abandoned row total fallback in loader.
  src = src.replace(
    /total: checkout\.totalPrice \? checkout\.totalPrice\.toString\(\) : null,/g,
    `total: checkout.totalPrice && Number(checkout.totalPrice) > 0 ? checkout.totalPrice.toString() : String(lineItemsTotal(toLineItems(checkout.lineItems)) || ""),`
  );

  // Add total amounts before return json in loader.
  if (!src.includes("const activeCartAmount = rows")) {
    src = src.replace(
      /return json\(\{\s*shop,\s*days,\s*rows,\s*totals:\s*\{ loggedInCarts: loggedInCarts\.length, abandonedCheckouts: abandonedCheckouts\.length, all: rows\.length \},\s*\}\);/,
      `const activeCartAmount = rows
    .filter((row) => row.source === "Logged-in cart")
    .reduce((sum, row) => sum + rowAmount(row), 0);

  const abandonedAmount = rows
    .filter((row) => row.source === "Abandoned checkout")
    .reduce((sum, row) => sum + rowAmount(row), 0);

  return json({
    shop,
    days,
    rows,
    totals: {
      loggedInCarts: loggedInCarts.length,
      abandonedCheckouts: abandonedCheckouts.length,
      all: rows.length,
      activeCartAmount,
      abandonedAmount,
      combinedAmount: activeCartAmount + abandonedAmount,
      currencyCode: rows.find((row) => row.currencyCode)?.currencyCode || "CAD",
    },
  });`
    );
  }

  // If totals object was already expanded without amount fields, add them.
  if (!src.includes("activeCartAmount,")) {
    src = src.replace(
      /all:\s*rows\.length,?\s*\}/,
      `all: rows.length,
      activeCartAmount,
      abandonedAmount,
      combinedAmount: activeCartAmount + abandonedAmount,
      currencyCode: rows.find((row) => row.currencyCode)?.currencyCode || "CAD",
    }`
    );
  }

  // Add amount metric cards after the existing three metric cards.
  if (!src.includes('label="Active cart amount"')) {
    src = src.replace(
      /<Metric label="Total records" value=\{totals\.all\} help="Combined cart and checkout records\." \/>/,
      `<Metric label="Total records" value={totals.all} help="Combined cart and checkout records." />`
    );

    // Insert amount cards after the first InlineGrid metrics section by adding a second InlineGrid.
    src = src.replace(
      /<\/InlineGrid>\s*\n\s*<Card>\s*\n\s*<form method="get"/,
      `</InlineGrid>

      <InlineGrid columns={{ xs: 1, sm: 3 }} gap="400">
        <Card>
          <BlockStack gap="150">
            <Text as="p" tone="subdued">Active cart amount</Text>
            <Text as="h2" variant="headingLg">{money(totals.activeCartAmount, totals.currencyCode)}</Text>
            <Text as="p" tone="subdued">Total value of active logged-in carts in this view.</Text>
          </BlockStack>
        </Card>
        <Card>
          <BlockStack gap="150">
            <Text as="p" tone="subdued">Abandoned amount</Text>
            <Text as="h2" variant="headingLg">{money(totals.abandonedAmount, totals.currencyCode)}</Text>
            <Text as="p" tone="subdued">Total value of abandoned checkouts in this view.</Text>
          </BlockStack>
        </Card>
        <Card>
          <BlockStack gap="150">
            <Text as="p" tone="subdued">Combined amount</Text>
            <Text as="h2" variant="headingLg">{money(totals.combinedAmount, totals.currencyCode)}</Text>
            <Text as="p" tone="subdued">Active carts plus abandoned checkouts.</Text>
          </BlockStack>
        </Card>
      </InlineGrid>

      <Card>
        <form method="get"`
    );
  }

  fs.writeFileSync(file, src, "utf8");
  console.log("Patched Cart History abandoned amount cards:", file);
}

patchAbandonedService();
patchCartHistory();
