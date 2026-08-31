/**
 * Seeds the database from the Assessment 1 phoneme dataset.
 *
 * The source JSON is denormalised — every word inlines its full phoneme objects — so the
 * seed flattens it into the relational model: 43 phonemes, the distinct set of words with
 * their ordered phoneme sequences, one word list per phoneme plus one per Wordle
 * difficulty tier, and a handful of starter activities.
 *
 * Idempotent: re-running upserts rows on their natural keys and rebuilds the ordered
 * child rows, so `prisma db seed` can be run repeatedly without duplicating data.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../lib/generated/prisma/client";
import { DIFFICULTIES, type Difficulty } from "../lib/constants";

type SourcePhoneme = {
  ipa: string;
  label: string;
  example: string;
  english: string;
};

type SourceWordleConfig = {
  englishWord: string;
  word: SourcePhoneme[];
  maxGuesses: number;
  difficulty: "easy" | "medium" | "hard";
};

type SourceWordSearchConfig = {
  phoneme: SourcePhoneme;
  words: { english: string; phonemes: SourcePhoneme[] }[];
  size: number;
};

type Dataset = {
  phonemeInventory: SourcePhoneme[];
  wordleConfigs: SourceWordleConfig[];
  wordSearchConfigs: SourceWordSearchConfig[];
};

/** Word Search word counts per difficulty, capped at the phoneme's available pool. */
const WORD_SEARCH_COUNTS: Record<Difficulty, number> = {
  easy: 3,
  medium: 5,
  hard: 8,
};

/** Matches the frontend's current `initialSeed`, so seeded grids look familiar. */
const DEFAULT_SEED = 42;

/** Fixed grid: the frontend builds every Word Search at this size. */
const WORD_SEARCH_SIZE = 8;

function loadDataset(): Dataset {
  const path = new URL("./seed-data/phoneme-word-list.json", import.meta.url);
  return JSON.parse(readFileSync(path, "utf8")) as Dataset;
}

const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env first.");
}

const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });

async function main() {
  const dataset = loadDataset();

  // --- Phonemes -----------------------------------------------------------------
  // `ipa` is the natural key. Upserting on it means a re-run refreshes labels and
  // hints without orphaning the words that already reference each phoneme.
  for (const phoneme of dataset.phonemeInventory) {
    await prisma.phoneme.upsert({
      where: { ipa: phoneme.ipa },
      create: phoneme,
      update: {
        label: phoneme.label,
        example: phoneme.example,
        english: phoneme.english,
      },
    });
  }

  const phonemeIdByIpa = new Map(
    (await prisma.phoneme.findMany({ select: { id: true, ipa: true } })).map(
      (p) => [p.ipa, p.id] as const,
    ),
  );

  // --- Words --------------------------------------------------------------------
  // Collect every distinct English word across both activity types. The dataset is
  // internally consistent (no word appears with two different phoneme sequences), so
  // the first sequence seen for a word is authoritative.
  const phonemesByWord = new Map<string, SourcePhoneme[]>();

  for (const config of dataset.wordleConfigs) {
    if (!phonemesByWord.has(config.englishWord)) {
      phonemesByWord.set(config.englishWord, config.word);
    }
  }

  for (const config of dataset.wordSearchConfigs) {
    for (const word of config.words) {
      if (!phonemesByWord.has(word.english)) {
        phonemesByWord.set(word.english, word.phonemes);
      }
    }
  }

  for (const [english, phonemes] of phonemesByWord) {
    const word = await prisma.word.upsert({
      where: { english },
      create: { english },
      update: {},
      select: { id: true },
    });

    // Rebuild the sequence rather than diffing it — `position` is a unique column, so
    // an in-place update would collide with the rows still holding those positions.
    await prisma.wordPhoneme.deleteMany({ where: { wordId: word.id } });
    await prisma.wordPhoneme.createMany({
      data: phonemes.map((phoneme, position) => {
        const phonemeId = phonemeIdByIpa.get(phoneme.ipa);

        if (phonemeId === undefined) {
          throw new Error(
            `Word "${english}" references unknown phoneme "${phoneme.ipa}".`,
          );
        }

        return { wordId: word.id, phonemeId, position };
      }),
    });
  }

  const wordIdByEnglish = new Map(
    (await prisma.word.findMany({ select: { id: true, english: true } })).map(
      (w) => [w.english, w.id] as const,
    ),
  );

  /** Creates or refreshes a word list and its ordered membership. */
  async function upsertWordList(
    name: string,
    description: string,
    englishWords: string[],
    targetPhonemeId: number | null,
  ) {
    const list = await prisma.wordList.upsert({
      where: { name },
      create: { name, description, targetPhonemeId },
      update: { description, targetPhonemeId },
      select: { id: true },
    });

    await prisma.wordListItem.deleteMany({ where: { wordListId: list.id } });
    await prisma.wordListItem.createMany({
      data: englishWords.map((english, position) => {
        const wordId = wordIdByEnglish.get(english);

        if (wordId === undefined) {
          throw new Error(`Word list "${name}" references unknown word "${english}".`);
        }

        return { wordListId: list.id, wordId, position };
      }),
    });

    return list.id;
  }

  // --- Word lists: one per phoneme ----------------------------------------------
  const listIdByPhonemeIpa = new Map<string, number>();

  for (const config of dataset.wordSearchConfigs) {
    const targetPhonemeId = phonemeIdByIpa.get(config.phoneme.ipa) ?? null;
    const listId = await upsertWordList(
      `${config.phoneme.ipa} words`,
      `Words containing the ${config.phoneme.ipa} sound — ${config.phoneme.label} (${config.phoneme.example}).`,
      config.words.map((word) => word.english),
      targetPhonemeId,
    );

    listIdByPhonemeIpa.set(config.phoneme.ipa, listId);
  }

  // --- Word lists: one per Wordle difficulty tier --------------------------------
  const listIdByDifficulty = new Map<Difficulty, number>();

  for (const difficulty of DIFFICULTIES) {
    const configs = dataset.wordleConfigs.filter((c) => c.difficulty === difficulty);
    const phonemeCount = configs[0]?.word.length ?? 0;
    const listId = await upsertWordList(
      `${difficulty} Wordle words`,
      `${configs.length} ${phonemeCount}-phoneme words for ${difficulty} Wordle activities.`,
      configs.map((config) => config.englishWord),
      null,
    );

    listIdByDifficulty.set(difficulty, listId);
  }

  // --- Starter activities: Wordle -----------------------------------------------
  // Each difficulty gets two kinds of activity
  for (const difficulty of DIFFICULTIES) {
    const configs = dataset.wordleConfigs.filter((c) => c.difficulty === difficulty);
    const wordListId = listIdByDifficulty.get(difficulty)!;
    const wordLength = configs[0].word.length;
    const maxGuesses = configs[0].maxGuesses;

    const tierData = {
      name: `${difficulty} Wordle`,
      type: "wordle",
      difficulty,
      wordListId,
      maxGuesses,
      wordLength,
      wordId: null,
    };

    const existingTier = await prisma.activity.findFirst({
      where: { type: "wordle", difficulty, wordId: null },
      select: { id: true },
    });

    if (existingTier) {
      await prisma.activity.update({ where: { id: existingTier.id }, data: tierData });
    } else {
      await prisma.activity.create({ data: tierData });
    }

    for (const config of configs.slice(0, 2)) {
      const wordId = wordIdByEnglish.get(config.englishWord);

      if (wordId === undefined) {
        throw new Error(`Wordle seed references unknown word "${config.englishWord}".`);
      }

      const data = {
        name: config.englishWord,
        type: "wordle",
        difficulty,
        wordListId,
        maxGuesses: config.maxGuesses,
        wordLength: config.word.length,
        wordId,
      };

      const existing = await prisma.activity.findFirst({
        where: { type: "wordle", wordId },
        select: { id: true },
      });

      if (existing) {
        await prisma.activity.update({ where: { id: existing.id }, data });
      } else {
        await prisma.activity.create({ data });
      }
    }
  }

  // --- Starter activities: Word Search ------------------------------------------
  // The grid is a fixed 8x8, so difficulty is only ever how many words are hidden in it
  // (3 / 5 / 8) and the phonemes with the largest pools take the hardest activities.
  const richestConfigs = [...dataset.wordSearchConfigs]
    .sort((a, b) => b.words.length - a.words.length || a.phoneme.ipa.localeCompare(b.phoneme.ipa))
    .slice(0, DIFFICULTIES.length);

  // Largest pool takes the hardest activity.
  const wordSearchPairs = DIFFICULTIES.map(
    (difficulty, index) =>
      [difficulty, richestConfigs[DIFFICULTIES.length - 1 - index]] as const,
  );

  /** Word Search names are free-form, so the name is the natural key. */
  async function upsertWordSearch(data: {
    name: string;
    difficulty: Difficulty;
    wordListId: number;
    ipa: string;
    wordCount: number;
  }) {
    const row = {
      name: data.name,
      type: "word_search",
      difficulty: data.difficulty,
      wordListId: data.wordListId,
      targetPhonemeId: phonemeIdByIpa.get(data.ipa) ?? null,
      gridSize: WORD_SEARCH_SIZE,
      seed: DEFAULT_SEED,
      wordCount: data.wordCount,
    };

    const existing = await prisma.activity.findFirst({
      where: { type: "word_search", name: data.name },
      select: { id: true },
    });

    if (existing) {
      await prisma.activity.update({ where: { id: existing.id }, data: row });
    } else {
      await prisma.activity.create({ data: row });
    }
  }

  for (const [difficulty, config] of wordSearchPairs) {
    if (!config) continue;

    await upsertWordSearch({
      name: `${config.phoneme.label} sound hunt (${difficulty})`,
      difficulty,
      wordListId: listIdByPhonemeIpa.get(config.phoneme.ipa)!,
      ipa: config.phoneme.ipa,
      wordCount: Math.min(WORD_SEARCH_COUNTS[difficulty], config.words.length),
    });
  }

  // One sound, two activities: a shorter warm-up list alongside the full one, which is
  // what naming an activity is for — the same target sound with different words.
  const [richest] = richestConfigs;

  if (richest && richest.words.length > WORD_SEARCH_COUNTS.easy) {
    const warmUpWords = richest.words
      .slice(0, WORD_SEARCH_COUNTS.easy)
      .map((word) => word.english);
    const warmUpListId = await upsertWordList(
      `${richest.phoneme.ipa} warm-up`,
      `A short ${richest.phoneme.ipa} list for a first pass at the sound.`,
      warmUpWords,
      phonemeIdByIpa.get(richest.phoneme.ipa) ?? null,
    );

    await upsertWordSearch({
      name: `${richest.phoneme.label} warm-up`,
      difficulty: "easy",
      wordListId: warmUpListId,
      ipa: richest.phoneme.ipa,
      wordCount: warmUpWords.length,
    });

    await upsertWordSearch({
      name: `${richest.phoneme.label} sound review`,
      difficulty: "medium",
      wordListId: listIdByPhonemeIpa.get(richest.phoneme.ipa)!,
      ipa: richest.phoneme.ipa,
      wordCount: Math.min(WORD_SEARCH_COUNTS.medium, richest.words.length),
    });
  }

  const [phonemes, words, wordPhonemes, wordLists, wordListItems, activities] =
    await Promise.all([
      prisma.phoneme.count(),
      prisma.word.count(),
      prisma.wordPhoneme.count(),
      prisma.wordList.count(),
      prisma.wordListItem.count(),
      prisma.activity.count(),
    ]);

  console.log("Seed complete:");
  console.table({
    phonemes,
    words,
    wordPhonemes,
    wordLists,
    wordListItems,
    activities,
  });
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
