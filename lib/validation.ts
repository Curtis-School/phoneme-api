import { z } from "zod";

/** Request schemas validation. */
const text = (max = 200) =>
  z
    .string()
    .trim()
    .min(1, "must not be empty")
    .max(max, `must be ${max} characters or fewer`);

export const idParamSchema = z.coerce
  .number({ error: "id must be a number" })
  .int("id must be a whole number")
  .positive("id must be positive");

export const phonemeCreateSchema = z.object({
  ipa: text(16),
  label: text(16),
  example: text(120),
  english: text(16),
});

// Every field optional for PATCH, but at least one must be present
export const phonemeUpdateSchema = phonemeCreateSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    error: "Provide at least one field to update.",
  });

export const phonemeListQuerySchema = z.object({
  search: z.string().trim().min(1).max(120).optional(),
});

export const wordCreateSchema = z.object({
  english: text(60),
  hint: text(200).nullish(),
  phonemes: z
    .array(text(16))
    .min(1, "must contain at least one phoneme")
    .max(20, "must contain 20 phonemes or fewer"),
});

// `phonemes` replaces the whole sequence when present — there is no partial reordering,
// because positions are contiguous and a half-applied change would leave gaps.
export const wordUpdateSchema = z
  .object({
    english: text(60),
    hint: text(200).nullish(),
    phonemes: z
      .array(text(16))
      .min(1, "must contain at least one phoneme")
      .max(20, "must contain 20 phonemes or fewer"),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    error: "Provide at least one field to update.",
  });

export const wordsQuerySchema = z.object({
  search: z.string().trim().min(1).max(120).optional(),
  /** Filter to words containing this IPA symbol, e.g. ?phoneme=/θ/ */
  phoneme: z.string().trim().min(1).max(16).optional(),
  /** Filter to words with exactly this many phonemes, e.g. ?length=3 */
  length: z.coerce
    .number({ error: "length must be a number" })
    .int("length must be a whole number")
    .positive("length must be positive")
    .max(20)
    .optional(),
});

export type WordCreateInput = z.infer<typeof wordCreateSchema>;
export type WordUpdateInput = z.infer<typeof wordUpdateSchema>;

/**
 * Ordered membership for a word list, given as English spellings.
 *
 * Duplicates are rejected.
 */
const wordMembership = z
  .array(text(60))
  .max(200, "a list may hold 200 words or fewer")
  .refine(
    (words) => new Set(words).size === words.length,
    { error: "must not contain duplicate words" },
  );

export const wordListCreateSchema = z.object({
  name: text(80),
  description: text(300).nullish(),
  /** IPA symbol of the sound this list is built around, e.g. "/θ/". */
  targetPhoneme: text(16).nullish(),
  words: wordMembership.optional(),
});

// `words` replaces the whole membership when present — the same all-or-nothing rule as
// a word's phoneme sequence, and for the same reason: positions must stay contiguous.
export const wordListUpdateSchema = z
  .object({
    name: text(80),
    description: text(300).nullish(),
    targetPhoneme: text(16).nullish(),
    words: wordMembership,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    error: "Provide at least one field to update.",
  });

export const wordListQuerySchema = z.object({
  search: z.string().trim().min(1).max(120).optional(),
  /** Filter to lists built around this IPA symbol. */
  phoneme: z.string().trim().min(1).max(16).optional(),
});

export type WordListCreateInput = z.infer<typeof wordListCreateSchema>;
export type WordListUpdateInput = z.infer<typeof wordListUpdateSchema>;

export type PhonemeCreateInput = z.infer<typeof phonemeCreateSchema>;
export type PhonemeUpdateInput = z.infer<typeof phonemeUpdateSchema>;
