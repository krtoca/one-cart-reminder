const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

function arg(name) {
  const found = process.argv.find((value) => value.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : null;
}

async function main() {
  const shop = arg("shop");
  const id = arg("id");
  const email = arg("email");
  const customerId = arg("customer-id");

  if (!shop) {
    throw new Error("Missing --shop=your-store.myshopify.com");
  }

  const where = {
    shop,
    orderedAt: null,
  };

  if (id) {
    where.id = id;
  } else if (email) {
    where.customerEmail = String(email).trim().toLowerCase();
  } else if (customerId) {
    where.customerId = String(customerId);
  } else {
    throw new Error("Provide one of --id=, --email=, or --customer-id=");
  }

  const result = await prisma.customerCart.updateMany({
    where,
    data: {
      orderedAt: new Date(),
      itemCount: 0,
      subtotal: null,
      lineItems: [],
      lastCapturedAt: new Date(),
    },
  });

  console.log(`Cleared ${result.count} active cart record(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
