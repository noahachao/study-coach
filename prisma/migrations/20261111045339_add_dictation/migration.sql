-- CreateTable
CREATE TABLE "DictationItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "pinyin" TEXT,
    "meaning" TEXT,
    "note" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "lastWrongForm" TEXT,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DictationItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DictationRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dictationItemId" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "wrongForm" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DictationRecord_dictationItemId_fkey" FOREIGN KEY ("dictationItemId") REFERENCES "DictationItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DictationItem_userId_lang_createdAt_idx" ON "DictationItem"("userId", "lang", "createdAt");

-- CreateIndex
CREATE INDEX "DictationRecord_dictationItemId_createdAt_idx" ON "DictationRecord"("dictationItemId", "createdAt");
