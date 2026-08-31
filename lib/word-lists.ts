import { ApiError } from "@/lib/http";
import type { PhonemeRow } from "@/lib/phonemes";
import { prisma } from "@/lib/prisma";
import { serializeWord, wordInclude } from "@/lib/words";

/** Shared shapes for reading word lists. */
export const wordListSummaryInclude = {
  targetPhoneme: true,
  _count: { select: { items: true, activities: true } },
} as const;

export const wordListDetailInclude = {
  targetPhoneme: true,
  _count: { select: { activities: true } },
  items: {
    orderBy: { position: "asc" },
    include: { word: { include: wordInclude } },
  },
} as const;

type WordListBase = {
  id: number;
  name: string;
  description: string | null;
  targetPhoneme: PhonemeRow | null;
  createdAt: Date;
  updatedAt: Date;
};

type WordListSummary = WordListBase & {
  _count: { items: number; activities: number };
};

type WordListDetail = WordListBase & {
  _count: { activities: number };
  items: { word: Parameters<typeof serializeWord>[0] }[];
};

export function serializeWordListSummary(list: WordListSummary) {
  return {
    id: list.id,
    name: list.name,
    description: list.description,
    targetPhoneme: list.targetPhoneme,
    wordCount: list._count.items,
    activityCount: list._count.activities,
    createdAt: list.createdAt,
    updatedAt: list.updatedAt,
  };
}

export function serializeWordListDetail(list: WordListDetail) {
  return {
    id: list.id,
    name: list.name,
    description: list.description,
    targetPhoneme: list.targetPhoneme,
    wordCount: list.items.length,
    activityCount: list._count.activities,
    // Flattened out of the join rows, in the teacher's chosen order.
    words: list.items.map((item) => serializeWord(item.word)),
    createdAt: list.createdAt,
    updatedAt: list.updatedAt,
  };
}

/** Translates an IPA symbol into a phoneme id, or null when the field was omitted. */
export async function resolveTargetPhonemeId(ipa: string | null | undefined) {
  if (ipa === null || ipa === undefined) {
    return null;
  }

  const phoneme = await prisma.phoneme.findUnique({
    where: { ipa },
    select: { id: true },
  });

  if (!phoneme) {
    throw new ApiError(400, "VALIDATION_ERROR", `Unknown phoneme symbol: ${ipa}.`, {
      unknownPhonemes: [ipa],
    });
  }

  return phoneme.id;
}
