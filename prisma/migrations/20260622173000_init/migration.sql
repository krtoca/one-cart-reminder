CREATE TABLE "Session" (
  "id" TEXT NOT NULL,
  "shop" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "isOnline" BOOLEAN NOT NULL DEFAULT false,
  "scope" TEXT,
  "expires" TIMESTAMP(3),
  "accessToken" TEXT NOT NULL,
  "userId" BIGINT,
  "firstName" TEXT,
  "lastName" TEXT,
  "email" TEXT,
  "accountOwner" BOOLEAN NOT NULL DEFAULT false,
  "locale" TEXT,
  "collaborator" BOOLEAN DEFAULT false,
  "emailVerified" BOOLEAN DEFAULT false,
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CartReminderSetting" (
  "id" TEXT NOT NULL,
  "shop" TEXT NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "loggedInCartEnabled" BOOLEAN NOT NULL DEFAULT true,
  "abandonedCheckoutEnabled" BOOLEAN NOT NULL DEFAULT true,
  "autoCartSyncEnabled" BOOLEAN NOT NULL DEFAULT false,
  "daysAfter" INTEGER NOT NULL DEFAULT 7,
  "dailySendHour" INTEGER NOT NULL DEFAULT 9,
  "timezone" TEXT NOT NULL DEFAULT 'America/Toronto',
  "fromName" TEXT NOT NULL DEFAULT 'One Wholesale',
  "subject" TEXT NOT NULL DEFAULT 'You left items in your cart',
  "headline" TEXT NOT NULL DEFAULT 'Your cart is waiting',
  "bodyText" TEXT NOT NULL DEFAULT 'You left some items in your cart. You can continue where you left off below.',
  "buttonText" TEXT NOT NULL DEFAULT 'Return to cart',
  "footerText" TEXT NOT NULL DEFAULT 'You are receiving this because you have an account or started checkout on our store. You can unsubscribe from marketing emails anytime.',
  "storefrontUrl" TEXT,
  "trackerToken" TEXT NOT NULL,
  "lastCronRunAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CartReminderSetting_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CartReminderSetting_shop_key" ON "CartReminderSetting"("shop");

CREATE TABLE "CustomerCart" (
  "id" TEXT NOT NULL,
  "shop" TEXT NOT NULL,
  "customerId" TEXT,
  "customerEmail" TEXT NOT NULL,
  "cartToken" TEXT,
  "cartUrl" TEXT,
  "itemCount" INTEGER NOT NULL DEFAULT 0,
  "subtotal" DECIMAL(12,2),
  "currencyCode" TEXT,
  "lineItems" JSONB,
  "source" TEXT NOT NULL DEFAULT 'LOGGED_IN_CART',
  "lastCapturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "orderedAt" TIMESTAMP(3),
  "reminderSentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerCart_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CustomerCart_shop_customerEmail_idx" ON "CustomerCart"("shop", "customerEmail");
CREATE INDEX "CustomerCart_shop_lastCapturedAt_idx" ON "CustomerCart"("shop", "lastCapturedAt");

CREATE TABLE "AbandonedCheckoutReminder" (
  "id" TEXT NOT NULL,
  "shop" TEXT NOT NULL,
  "abandonedCheckoutId" TEXT NOT NULL,
  "checkoutName" TEXT,
  "customerEmail" TEXT NOT NULL,
  "customerId" TEXT,
  "checkoutUrl" TEXT NOT NULL,
  "totalPrice" DECIMAL(12,2),
  "currencyCode" TEXT,
  "itemCount" INTEGER NOT NULL DEFAULT 0,
  "lineItems" JSONB,
  "checkoutCreatedAt" TIMESTAMP(3) NOT NULL,
  "checkoutUpdatedAt" TIMESTAMP(3) NOT NULL,
  "checkoutCompletedAt" TIMESTAMP(3),
  "reminderSentAt" TIMESTAMP(3),
  "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AbandonedCheckoutReminder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AbandonedCheckoutReminder_shop_abandonedCheckoutId_key" ON "AbandonedCheckoutReminder"("shop", "abandonedCheckoutId");
CREATE INDEX "AbandonedCheckoutReminder_shop_customerEmail_idx" ON "AbandonedCheckoutReminder"("shop", "customerEmail");
CREATE INDEX "AbandonedCheckoutReminder_shop_checkoutCreatedAt_idx" ON "AbandonedCheckoutReminder"("shop", "checkoutCreatedAt");

CREATE TABLE "ReminderEmailLog" (
  "id" TEXT NOT NULL,
  "shop" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "ok" BOOLEAN NOT NULL DEFAULT false,
  "errorMessage" TEXT,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReminderEmailLog_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReminderEmailLog_shop_sourceType_sourceId_key" ON "ReminderEmailLog"("shop", "sourceType", "sourceId");
CREATE INDEX "ReminderEmailLog_shop_email_idx" ON "ReminderEmailLog"("shop", "email");
