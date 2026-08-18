import { ApiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

/**
 * Shared helpers for reading and writing words.
 *
 * A word's identity is its ordered phoneme sequence, which lives in the WordPhoneme
 * join table. Everything here exists to keep that ordering correct and to translate
 * between the API's flat shape and the relational one.
 */

/** Always load a word's phonemes in sequence order, never in insertion order. */
export const wordInclude = {
  phonemes: {
    orderBy: { position: "asc" },
    include: { phoneme: true },
  },
} as const;

type WordWithPhonemes = {
  id: number;
  english: string;
  hint: string | null;
  createdAt: Date;
  updatedAt: Date;
  phonemes: {
    phoneme: {
      id: number;
      ipa: string;
      label: string;
      example: string;
      english: string;
    };
  }[];
};

/**
 * Flattens the join rows away so the API returns `phonemes: Phoneme[]` — the same shape
 * the frontend's `PhonemeWord` type already expects, rather than a nested join structure
 * callers would have to unwrap themselves.
 */
export function serializeWord(word: WordWithPhonemes) {
  return {
    id: word.id,
    english: word.english,
    hint: word.hint,
    phonemes: word.phonemes.map((link) => link.phoneme),
    createdAt: word.createdAt,
    updatedAt: word.updatedAt,
  };
}

/**
 * Maps IPA symbols onto phoneme ids, preserving the caller's order.
 *
 * Rejects the whole request if any symbol is unknown — the brief calls for malformed
 * phoneme data to be handled gracefully, so the response names every offending symbol
 * rather than failing on the first one or silently dropping it.
 */
export async function resolvePhonemeIds(ipas: string[]): Promise<number[]> {
  const known = await prisma.phoneme.findMany({
    where: { ipa: { in: ipas } },
    select: { id: true, ipa: true },
  });

  const idByIpa = new Map(known.map((phoneme) => [phoneme.ipa, phoneme.id] as const));
  const unknown = [...new Set(ipas.filter((ipa) => !idByIpa.has(ipa)))];

  if (unknown.length > 0) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      `Unknown phoneme symbol(s): ${unknown.join(", ")}.`,
      { unknownPhonemes: unknown },
    );
  }

  return ipas.map((ipa) => idByIpa.get(ipa)!);
}
