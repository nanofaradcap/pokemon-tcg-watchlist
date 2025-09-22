-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ProfileCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "setDisplay" TEXT,
    "jpNo" TEXT,
    "rarity" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProfileCard_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProfileCard_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Card" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "url" TEXT NOT NULL,
    "profile" TEXT DEFAULT 'Chen',
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
INSERT INTO "new_Card" ("createdAt", "currency", "id", "imageUrl", "jpNo", "lastCheckedAt", "marketPrice", "name", "productId", "profile", "rarity", "setDisplay", "updatedAt", "url") SELECT "createdAt", "currency", "id", "imageUrl", "jpNo", "lastCheckedAt", "marketPrice", "name", "productId", "profile", "rarity", "setDisplay", "updatedAt", "url" FROM "Card";
DROP TABLE "Card";
ALTER TABLE "new_Card" RENAME TO "Card";
CREATE UNIQUE INDEX "Card_url_key" ON "Card"("url");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Profile_name_key" ON "Profile"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ProfileCard_profileId_cardId_key" ON "ProfileCard"("profileId", "cardId");
