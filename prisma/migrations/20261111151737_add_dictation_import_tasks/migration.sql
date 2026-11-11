-- CreateTable
CREATE TABLE "DictationImportTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'analyzing',
    "imageData" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "drafts" TEXT,
    "error" TEXT,
    "runnerId" TEXT,
    "heartbeatAt" DATETIME,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DictationImportTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DictationImportTask_userId_status_idx" ON "DictationImportTask"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DictationImportTask_userId_clientRequestId_key" ON "DictationImportTask"("userId", "clientRequestId");
