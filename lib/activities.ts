import { ApiError, plural } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { resolveTargetPhonemeId } from "@/lib/word-lists";
import type { ActivityCreateInput } from "@/lib/validation";

/**
 * Shared helpers for activities — the saved Wordle / Word Search configurations.
 */

export const activityInclude = {
  targetPhoneme: true,
  wordList: { select: { id: true, name: true, _count: { select: { items: true } } } },
} as const;

type ActivityRow = {
  id: number;
  name: string;
  type: string;
  difficulty: string;
  wordListId: number;
  maxGuesses: number | null;
  wordLength: number | null;
  gridSize: number | null;
  seed: number | null;
  wordCount: number | null;
  symbolDisplay: string;
  showTooltips: boolean;
  theme: string;
  createdAt: Date;
  updatedAt: Date;
  targetPhoneme: { ipa: string; label: string; example: string; english: string } | null;
  wordList: { id: number; name: string; _count: { items: number } };
};

/**
 * Returns only the settings that apply to the activity's own type.
 *
 * The table holds every setting for both types in one row because SQLite has no
 * inheritance, but a Wordle carrying `gridSize: null` in its response would just invite
 * callers to read a field that means nothing for it.
 */
export function serializeActivity(activity: ActivityRow) {
  const base = {
    id: activity.id,
    name: activity.name,
    type: activity.type,
    difficulty: activity.difficulty,
    wordList: {
      id: activity.wordList.id,
      name: activity.wordList.name,
      wordCount: activity.wordList._count.items,
    },
    symbolDisplay: activity.symbolDisplay,
    showTooltips: activity.showTooltips,
    theme: activity.theme,
    createdAt: activity.createdAt,
    updatedAt: activity.updatedAt,
  };

  if (activity.type === "wordle") {
    return {
      ...base,
      maxGuesses: activity.maxGuesses,
      wordLength: activity.wordLength,
    };
  }

  return {
    ...base,
    targetPhoneme: activity.targetPhoneme,
    gridSize: activity.gridSize,
    seed: activity.seed,
    wordCount: activity.wordCount,
  };
}

/** Turns a stored row back into the shape `activityCreateSchema` accepts. */
export function toCreateInput(activity: ActivityRow): Record<string, unknown> {
  const base = {
    type: activity.type,
    name: activity.name,
    difficulty: activity.difficulty,
    wordListId: activity.wordListId,
    symbolDisplay: activity.symbolDisplay,
    showTooltips: activity.showTooltips,
    theme: activity.theme,
  };

  if (activity.type === "wordle") {
    return { ...base, maxGuesses: activity.maxGuesses, wordLength: activity.wordLength };
  }

  return {
    ...base,
    targetPhoneme: activity.targetPhoneme?.ipa,
    gridSize: activity.gridSize,
    seed: activity.seed,
    wordCount: activity.wordCount,
  };
}

/**
 * Checks the configuration against the word list it points at.
 *
 * This is a fail-fast courtesy, not a guarantee: a list can be edited after the activity
 * is saved, so the generate endpoint must still cope with a list that no longer supports
 * its activity. Catching it here means the teacher hears about it while they are still
 * looking at the form.
 */
export async function assertActivityIsSatisfiable(input: ActivityCreateInput) {
  const wordList = await prisma.wordList.findUnique({
    where: { id: input.wordListId },
    select: { id: true, name: true, _count: { select: { items: true } } },
  });

  if (!wordList) {
    throw new ApiError(
      400,
      "INVALID_REFERENCE",
      `Word list ${input.wordListId} does not exist.`,
    );
  }

  if (input.type === "wordle") {
    // A Wordle picks a word of exactly `wordLength` phonemes, so the list has to hold one.
    const eligible = await prisma.word.count({
      where: {
        listItems: { some: { wordListId: wordList.id } },
        AND: [
          { phonemes: { some: { position: input.wordLength - 1 } } },
          { phonemes: { none: { position: input.wordLength } } },
        ],
      },
    });

    if (eligible === 0) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        `"${wordList.name}" contains no word with ${plural(input.wordLength, "phoneme")}, so this Wordle could never be generated.`,
        { wordListId: wordList.id, wordLength: input.wordLength },
      );
    }

    return;
  }

  if (input.wordCount > wordList._count.items) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      `"${wordList.name}" holds only ${plural(wordList._count.items, "word")}, but this Word Search asks for ${input.wordCount}.`,
      { wordListId: wordList.id, available: wordList._count.items, requested: input.wordCount },
    );
  }
}

/** Maps validated input onto the flat column set the table stores. */
export async function toActivityData(input: ActivityCreateInput) {
  const shared = {
    name: input.name,
    type: input.type,
    difficulty: input.difficulty,
    wordListId: input.wordListId,
    symbolDisplay: input.symbolDisplay ?? "ipa",
    showTooltips: input.showTooltips ?? true,
    theme: input.theme ?? "light",
  };

  if (input.type === "wordle") {
    return {
      ...shared,
      maxGuesses: input.maxGuesses,
      wordLength: input.wordLength,
      // Cleared so a row never carries settings from the other activity type.
      targetPhonemeId: null,
      gridSize: null,
      seed: null,
      wordCount: null,
    };
  }

  return {
    ...shared,
    maxGuesses: null,
    wordLength: null,
    targetPhonemeId: await resolveTargetPhonemeId(input.targetPhoneme),
    gridSize: input.gridSize,
    seed: input.seed ?? null,
    wordCount: input.wordCount,
  };
}
