
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const shopArg = process.argv.find((arg) => arg.startsWith("--shop="));
  const shop = shopArg ? shopArg.replace("--shop=", "") : null;

  const where = {
    orderedAt: null,
    OR: [
      { itemCount: { lte: 0 } },
      { lineItems: { equals: [] } },
    ],
  };

  if (shop) {
    where.shop = shop;
  }

  const result = await prisma.customerCart.updateMany({
    where,
    data: {
      orderedAt: new Date(),
      lastCapturedAt: new Date(),
      itemCount: 0,
      subtotal: null,
      lineItems: [],
    },
  });

  console.log(`Cleared ${result.count} empty active cart record(s).`);
  if (!shop) {
    console.log("Tip: you can limit by shop with --shop=your-store.myshopify.com");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
