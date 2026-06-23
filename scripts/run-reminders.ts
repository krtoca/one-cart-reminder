import { runReminderJobAllShops, runReminderJobForShop } from "../app/services/reminder-runner.server";
import prisma from "../app/db.server";

async function main() {
  const shopArg = process.argv.find((arg) => arg.startsWith("--shop="));
  const shop = shopArg?.split("=")[1];
  const result = shop ? await runReminderJobForShop(shop) : await runReminderJobAllShops();
  console.dir(result, { depth: null });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
