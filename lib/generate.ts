import { ApiError, plural } from "@/lib/http";
import { prisma } from "@/lib/prisma";

/**
 * Resolves a saved activity into the exact config shape the frontend already consumes. 
 */

/** The frontend's `Phoneme`: no id, no timestamps. */
export type PhonemeDto = {
  ipa: string;
  label: string;
  example: string;
  english: string;
};

type PhonemeRow = PhonemeDto & { id: number };

export function toPhonemeDto({ ipa, label, example, english }: PhonemeRow): PhonemeDto {
  return { ipa, label, example, english };
}

/**
 * Same PRNG the frontend uses to lay out a word-search grid.
 *
 * Sharing the algorithm means one seed reproduces the whole activity — the words chosen
 * here and the grid the frontend builds from them.
 */
function mulberry32(seed: number) {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates using the supplied generator, so selection is reproducible from a seed. */
function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items];

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

const activityForGenerate = {
  targetPhoneme: true,
  wordList: {
    select: {
      id: true,
      name: true,
      items: {
        orderBy: { position: "asc" },
        include: {
          word: {
            include: { phonemes: { orderBy: { position: "asc" }, include: { phoneme: true } } },
          },
        },
      },
    },
  },
} as const;

export async function loadActivityForGenerate(id: number) {
  const activity = await prisma.activity.findUnique({
    where: { id },
    include: activityForGenerate,
  });

  if (!activity) {
    throw ApiError.notFound(`Activity ${id}`);
  }

  return activity;
}

type LoadedActivity = Awaited<ReturnType<typeof loadActivityForGenerate>>;
type LoadedWord = LoadedActivity["wordList"]["items"][number]["word"];

function phonemesOf(word: LoadedWord): PhonemeDto[] {
  return word.phonemes.map((link) => toPhonemeDto(link.phoneme));
}

/**
 * Builds a `WordleConfig`.
 *
 * `wordIdOverride` pins a specific target for this one call. Failing that, the
 * activity's own stored `wordId` is used — the same "saved pin" pattern as Word
 * Search's `seed`. An explicit override is a deliberate ask and fails loudly if it
 * doesn't fit; the stored pin is advisory, so if the word list has changed since it was
 * saved and the pin no longer fits, generation falls back to a random word rather than
 * failing the whole activity.
 */
export function buildWordleConfig(activity: LoadedActivity, wordIdOverride: number | undefined) {
  const { maxGuesses, wordLength } = activity;

  if (maxGuesses === null || wordLength === null) {
    throw new ApiError(
      409,
      "UNSATISFIABLE",
      `Activity ${activity.id} is a Wordle but is missing its guess or length settings.`,
    );
  }

  const words = activity.wordList.items.map((item) => item.word);
  const eligible = words.filter((word) => word.phonemes.length === wordLength);

  if (eligible.length === 0) {
    throw new ApiError(
      409,
      "UNSATISFIABLE",
      `"${activity.wordList.name}" no longer contains a word with ${plural(wordLength, "phoneme")}, so this Wordle cannot be generated.`,
      { wordListId: activity.wordList.id, wordLength },
    );
  }

  let target = eligible[Math.floor(Math.random() * eligible.length)];

  if (wordIdOverride !== undefined) {
    const pinned = eligible.find((word) => word.id === wordIdOverride);

    if (!pinned) {
      const inList = words.some((word) => word.id === wordIdOverride);

      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        inList
          ? `Word ${wordIdOverride} is in the list but does not have ${plural(wordLength, "phoneme")}.`
          : `Word ${wordIdOverride} is not in "${activity.wordList.name}".`,
        { wordId: wordIdOverride },
      );
    }

    target = pinned;
  } else if (activity.wordId !== null) {
    target = eligible.find((word) => word.id === activity.wordId) ?? target;
  }

  return {
    config: {
      englishWord: target.english,
      word: phonemesOf(target),
      maxGuesses,
      difficulty: activity.difficulty,
    },
    wordId: target.id,
  };
}

/**
 * Builds a `WordSearchConfig`.
 *
 * The seed drives which words are drawn, and is returned so the caller can hand the same
 * value to the frontend's grid generator and reproduce the whole activity later. An
 * activity with no stored seed gets a fresh one per request rather than none at all.
 */
export function buildWordSearchConfig(activity: LoadedActivity, seedOverride: number | undefined) {
  const { gridSize, targetPhoneme } = activity;

  if (gridSize === null || !targetPhoneme) {
    throw new ApiError(
      409,
      "UNSATISFIABLE",
      `Activity ${activity.id} is a Word Search but is missing its grid size or target sound.`,
    );
  }

  const available = activity.wordList.items.map((item) => item.word);

  if (available.length === 0) {
    throw new ApiError(
      409,
      "UNSATISFIABLE",
      `"${activity.wordList.name}" is empty, so this Word Search cannot be generated.`,
      { wordListId: activity.wordList.id },
    );
  }

  const seed = seedOverride ?? activity.seed ?? Math.floor(Math.random() * 2 ** 31);
  // Clamped rather than rejected: a list can shrink after the activity was saved, and a
  // smaller puzzle is more useful to a teacher than an error. The returned `words` length
  // makes the shortfall visible.
  const requested = Math.min(activity.wordCount ?? available.length, available.length);
  const chosen = shuffle(available, mulberry32(seed)).slice(0, requested);

  return {
    config: {
      phoneme: toPhonemeDto(targetPhoneme),
      words: chosen.map((word) => ({
        english: word.english,
        phonemes: phonemesOf(word),
      })),
      size: gridSize,
    },
    seed,
  };
}
