-- CreateTable
CREATE TABLE "ShopSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "warrantyEnabled" BOOLEAN NOT NULL DEFAULT false,
    "warrantyDefaultPresentation" TEXT DEFAULT 'POPUP',
    "warrantyDefaultPercentage" REAL DEFAULT 10.0,
    "warrantyGlobalDescription" TEXT,
    "warrantyProductId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProductConfiguration" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "noStockEnabled" BOOLEAN NOT NULL DEFAULT false,
    "noStockButtonText" TEXT,
    "noStockButtonColor" TEXT,
    "noStockNotifyFormEnabled" BOOLEAN NOT NULL DEFAULT true,
    "noStockTimerEnabled" BOOLEAN NOT NULL DEFAULT false,
    "noStockRestockDate" DATETIME,
    "noStockRecommendationsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "noStockRecommendedProductGids" TEXT,
    "preorderEnabled" BOOLEAN NOT NULL DEFAULT false,
    "preorderButtonText" TEXT,
    "preorderButtonColor" TEXT,
    "preorderEndDate" DATETIME,
    "preorderPaymentType" TEXT DEFAULT 'FULL',
    "preorderPartialPaymentValue" REAL,
    "preorderTerms" TEXT,
    "preorderTermsDisplay" TEXT DEFAULT 'INLINE',
    "warrantyEnabledOverride" BOOLEAN,
    "warrantyPresentationOverride" TEXT,
    "warrantyPriceType" TEXT DEFAULT 'GLOBAL_PERCENTAGE',
    "warrantyPriceValue" REAL,
    "warrantyVariantId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BackInStockSubscription" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "subscribedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifiedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'PENDING'
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopSettings_shop_key" ON "ShopSettings"("shop");

-- CreateIndex
CREATE INDEX "ProductConfiguration_shop_idx" ON "ProductConfiguration"("shop");

-- CreateIndex
CREATE INDEX "ProductConfiguration_productId_idx" ON "ProductConfiguration"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductConfiguration_shop_productId_key" ON "ProductConfiguration"("shop", "productId");

-- CreateIndex
CREATE INDEX "BackInStockSubscription_shop_productId_status_idx" ON "BackInStockSubscription"("shop", "productId", "status");

-- CreateIndex
CREATE INDEX "BackInStockSubscription_customerEmail_idx" ON "BackInStockSubscription"("customerEmail");
