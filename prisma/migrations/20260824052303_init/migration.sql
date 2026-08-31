-- CreateTable
CREATE TABLE "Phoneme" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ipa" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "example" TEXT NOT NULL,
    "english" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Word" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "english" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WordPhoneme" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "wordId" INTEGER NOT NULL,
    "phonemeId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    CONSTRAINT "WordPhoneme_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "Word" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WordPhoneme_phonemeId_fkey" FOREIGN KEY ("phonemeId") REFERENCES "Phoneme" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WordList" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "targetPhonemeId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WordList_targetPhonemeId_fkey" FOREIGN KEY ("targetPhonemeId") REFERENCES "Phoneme" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WordListItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "wordListId" INTEGER NOT NULL,
    "wordId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    CONSTRAINT "WordListItem_wordListId_fkey" FOREIGN KEY ("wordListId") REFERENCES "WordList" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WordListItem_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "Word" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Activity" (
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

-- CreateIndex
CREATE UNIQUE INDEX "Phoneme_ipa_key" ON "Phoneme"("ipa");

-- CreateIndex
CREATE UNIQUE INDEX "Word_english_key" ON "Word"("english");

-- CreateIndex
CREATE INDEX "WordPhoneme_phonemeId_idx" ON "WordPhoneme"("phonemeId");

-- CreateIndex
CREATE UNIQUE INDEX "WordPhoneme_wordId_position_key" ON "WordPhoneme"("wordId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "WordList_name_key" ON "WordList"("name");

-- CreateIndex
CREATE INDEX "WordList_targetPhonemeId_idx" ON "WordList"("targetPhonemeId");

-- CreateIndex
CREATE INDEX "WordListItem_wordId_idx" ON "WordListItem"("wordId");

-- CreateIndex
CREATE UNIQUE INDEX "WordListItem_wordListId_wordId_key" ON "WordListItem"("wordListId", "wordId");

-- CreateIndex
CREATE UNIQUE INDEX "WordListItem_wordListId_position_key" ON "WordListItem"("wordListId", "position");

-- CreateIndex
CREATE INDEX "Activity_wordListId_idx" ON "Activity"("wordListId");

-- CreateIndex
CREATE INDEX "Activity_targetPhonemeId_idx" ON "Activity"("targetPhonemeId");

-- CreateIndex
CREATE INDEX "Activity_wordId_idx" ON "Activity"("wordId");
