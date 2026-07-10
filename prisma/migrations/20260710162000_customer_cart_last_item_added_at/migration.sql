ALTER TABLE "CustomerCart" ADD COLUMN "lastItemAddedAt" TIMESTAMP(3);

UPDATE "CustomerCart"
SET "lastItemAddedAt" = "lastCapturedAt"
WHERE "lastItemAddedAt" IS NULL;

ALTER TABLE "CustomerCart" ALTER COLUMN "lastItemAddedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "CustomerCart" ALTER COLUMN "lastItemAddedAt" SET NOT NULL;

CREATE INDEX "CustomerCart_shop_lastItemAddedAt_idx" ON "CustomerCart"("shop", "lastItemAddedAt");
