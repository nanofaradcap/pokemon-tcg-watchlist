-- CreateTable
CREATE TABLE "Card" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "url" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "setDisplay" TEXT,
    "jpNo" TEXT,
    "rarity" TEXT,
    "imageUrl" TEXT,
    "marketPrice" REAL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "lastCheckedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Card_url_key" ON "Card"("url");
