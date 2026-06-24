
const fs = require("fs");
const path = require("path");

const root = process.cwd();

function patchFile(file) {
  if (!fs.existsSync(file)) return false;
  let src = fs.readFileSync(file, "utf8");

  if (!src.includes("markActiveCartClearedWhenEmpty")) {
    src = src.replace(
      /export async function action\(/,
      `async function markActiveCartClearedWhenEmpty(params: {
  shop: string;
  customerId?: string | null;
  customerEmail?: string | null;
  itemCount: number;
}) {
  if (params.itemCount > 0) return false;

  const where: any = {
    shop: params.shop,
    orderedAt: null,
  };

  if (params.customerId) {
    where.customerId = String(params.customerId);
  } else if (params.customerEmail) {
    where.customerEmail = String(params.customerEmail).toLowerCase();
  } else {
    return false;
  }

  await prisma.customerCart.updateMany({
    where,
    data: {
      itemCount: 0,
      subtotal: "0",
      lineItems: [],
      orderedAt: new Date(),
      lastCapturedAt: new Date(),
    },
  });

  return true;
}

export async function action(`
    );
  }

  if (!src.includes("clearedEmptyCart")) {
    const insert = `
  const clearedEmptyCart = await markActiveCartClearedWhenEmpty({
    shop,
    customerId: typeof customerId !== "undefined" ? customerId : null,
    customerEmail: typeof customerEmail !== "undefined" ? customerEmail : null,
    itemCount: typeof itemCount !== "undefined" ? Number(itemCount || 0) : typeof cartItemCount !== "undefined" ? Number(cartItemCount || 0) : 0,
  });

  if (clearedEmptyCart) {
    return json({ ok: true, cleared: true });
  }

`;

    const patterns = [
      /(const itemCount\s*=\s*[^;\n]+;)/,
      /(let itemCount\s*=\s*[^;\n]+;)/,
      /(const cartItemCount\s*=\s*[^;\n]+;)/,
      /(let cartItemCount\s*=\s*[^;\n]+;)/
    ];

    let done = false;
    for (const pattern of patterns) {
      if (pattern.test(src)) {
        src = src.replace(pattern, `$1\n${insert}`);
        done = true;
        break;
      }
    }

    if (!done) {
      src = src.replace(
        /(const\s+body\s*=\s*await request\.json\(\);|const\s+payload\s*=\s*await request\.json\(\);)/,
        `$1\n${insert}`
      );
    }
  }

  fs.writeFileSync(file, src, "utf8");
  console.log("Patched", file);
  return true;
}

const apiFiles = [
  "app/routes/api.cart.capture.tsx",
  "app/routes/api.cart.capture.ts",
  "app/routes/api.cart.sync.tsx",
  "app/routes/api.cart.sync.ts",
  "app/routes/api.cart.$.tsx",
  "app/routes/api.cart.$.ts",
].map((f) => path.join(root, f));

let patched = false;
for (const file of apiFiles) {
  patched = patchFile(file) || patched;
}

if (!patched) {
  console.error("No cart API route file was patched. Please check route filenames.");
  process.exit(1);
}

const historyFiles = [
  path.join(root, "app/routes/app.cart-history.tsx"),
  path.join(root, "app/routes/app.cart-history.ts"),
];

for (const file of historyFiles) {
  if (!fs.existsSync(file)) continue;
  let src = fs.readFileSync(file, "utf8");

  src = src.replace(
    /where:\s*\{\s*shop,\s*lastCapturedAt:\s*\{\s*gte:\s*since\s*\}\s*\}/g,
    "where: { shop, lastCapturedAt: { gte: since }, orderedAt: null }"
  );

  src = src.replace(
    /where:\s*\{\s*\n\s*shop,\s*\n\s*lastCapturedAt:\s*\{\s*gte:\s*since\s*\},?\s*\n\s*\}/g,
    "where: { shop, lastCapturedAt: { gte: since }, orderedAt: null }"
  );

  fs.writeFileSync(file, src, "utf8");
  console.log("Patched", file);
}

console.log("Done");
