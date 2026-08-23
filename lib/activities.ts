import { ApiError, plural } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { resolveTargetPhonemeId } from "@/lib/word-lists";
import { toPhonemeDto, type PhonemeDto } from "@/lib/generate";
import type { ActivityCreateInput } from "@/lib/validation";

/**
 * Shared helpers for activities — the saved Wordle / Word Search configurations.
 */

export const activityInclude = {
  targetPhoneme: true,
  wordList: { select: { id: true, name: true, _count: { select: { items: true } } } },
  word: {
    include: { phonemes: { orderBy: { position: "asc" }, include: { phoneme: true } } },
  },
} as const;

type ActivityRow = {
  id: number;
  name: string;
  type: string;
  difficulty: string;
  wordListId: number;
  maxGuesses: number | null;
  wordLength: number | null;
  wordId: number | null;
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
  word: { english: string; phonemes: { phoneme: PhonemeDto & { id: number } }[] } | null;
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
      word: activity.word
        ? {
            english: activity.word.english,
            phonemes: activity.word.phonemes.map((link) => toPhonemeDto(link.phoneme)),
          }
        : null,
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

    if (input.wordId != null) {
      const pinned = await prisma.word.findFirst({
        where: {
          id: input.wordId,
          listItems: { some: { wordListId: wordList.id } },
          AND: [
            { phonemes: { some: { position: input.wordLength - 1 } } },
            { phonemes: { none: { position: input.wordLength } } },
          ],
        },
        select: { id: true },
      });

      if (!pinned) {
        throw new ApiError(
          400,
          "INVALID_REFERENCE",
          `Word ${input.wordId} is not in "${wordList.name}" with ${plural(input.wordLength, "phoneme")}.`,
          { wordListId: wordList.id, wordId: input.wordId },
        );
      }
    }

    //Theme is included in the comparison rather than ignored:
    // the same word in a different theme is a deliberate
    const duplicate = await prisma.activity.findFirst({
      where: {
        type: "wordle",
        wordListId: wordList.id,
        difficulty: input.difficulty,
        wordId: input.wordId ?? null,
        symbolDisplay: input.symbolDisplay ?? "ipa",
        showTooltips: input.showTooltips ?? true,
        theme: input.theme ?? "light",
      },
      select: { id: true, name: true },
    });

    if (duplicate) {
      throw new ApiError(
        409,
        "CONFLICT",
        `This exact Wordle configuration is already saved as "${duplicate.name}".`,
        { activityId: duplicate.id },
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
      wordId: input.wordId ?? null,
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
    wordId: null,
    targetPhonemeId: await resolveTargetPhonemeId(input.targetPhoneme),
    gridSize: input.gridSize,
    seed: input.seed ?? null,
    wordCount: input.wordCount,
  };
}
