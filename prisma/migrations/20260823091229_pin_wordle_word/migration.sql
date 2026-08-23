-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Activity" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "wordListId" INTEGER NOT NULL,
    "maxGuesses" INTEGER,
    "wordLength" INTEGER,
    "wordId" INTEGER,
    "targetPhonemeId" INTEGER,
    "gridSize" INTEGER,
    "seed" INTEGER,
    "wordCount" INTEGER,
    "symbolDisplay" TEXT NOT NULL DEFAULT 'ipa',
    "showTooltips" BOOLEAN NOT NULL DEFAULT true,
    "theme" TEXT NOT NULL DEFAULT 'light',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Activity_wordListId_fkey" FOREIGN KEY ("wordListId") REFERENCES "WordList" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Activity_targetPhonemeId_fkey" FOREIGN KEY ("targetPhonemeId") REFERENCES "Phoneme" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Activity_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "Word" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Activity" ("createdAt", "difficulty", "gridSize", "id", "maxGuesses", "name", "seed", "showTooltips", "symbolDisplay", "targetPhonemeId", "theme", "type", "updatedAt", "wordCount", "wordLength", "wordListId") SELECT "createdAt", "difficulty", "gridSize", "id", "maxGuesses", "name", "seed", "showTooltips", "symbolDisplay", "targetPhonemeId", "theme", "type", "updatedAt", "wordCount", "wordLength", "wordListId" FROM "Activity";
DROP TABLE "Activity";
ALTER TABLE "new_Activity" RENAME TO "Activity";
CREATE INDEX "Activity_wordListId_idx" ON "Activity"("wordListId");
CREATE INDEX "Activity_targetPhonemeId_idx" ON "Activity"("targetPhonemeId");
CREATE INDEX "Activity_wordId_idx" ON "Activity"("wordId");
CREATE UNIQUE INDEX "Activity_name_type_key" ON "Activity"("name", "type");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
