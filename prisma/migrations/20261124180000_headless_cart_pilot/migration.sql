CREATE TABLE "HeadlessCartPilot" (
 "shop" TEXT NOT NULL,
 "customerId" TEXT NOT NULL,
 "storeId" TEXT NOT NULL,
 "revision" INTEGER NOT NULL,
 "customerEmail" TEXT NOT NULL,
 "lineItems" JSONB NOT NULL,
 "itemCount" INTEGER NOT NULL,
 "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY ("shop", "customerId", "storeId")
);
