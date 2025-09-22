-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Card" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "url" TEXT NOT NULL,
    "profile" TEXT NOT NULL DEFAULT 'Chen',
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
INSERT INTO "new_Card" ("createdAt", "currency", "id", "imageUrl", "jpNo", "lastCheckedAt", "marketPrice", "name", "productId", "rarity", "setDisplay", "updatedAt", "url") SELECT "createdAt", "currency", "id", "imageUrl", "jpNo", "lastCheckedAt", "marketPrice", "name", "productId", "rarity", "setDisplay", "updatedAt", "url" FROM "Card";
DROP TABLE "Card";
ALTER TABLE "new_Card" RENAME TO "Card";
CREATE UNIQUE INDEX "Card_profile_url_key" ON "Card"("profile", "url");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
