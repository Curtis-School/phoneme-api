import { z } from "zod";

import {
  ACTIVITY_TYPES,
  DIFFICULTIES,
  SYMBOL_DISPLAYS,
  THEMES,
} from "@/lib/constants";

/** Request schemas validation. */
const text = (max = 200) =>
  z
    .string()
    .trim()
    .min(1, "must not be empty")
    .max(max, `must be ${max} characters or fewer`);

const idParamSchema = z.coerce
  .number({ error: "id must be a number" })
  .int("id must be a whole number")
  .positive("id must be positive");

/**
 * Reads and validates the `:id` segment of a dynamic route.
 *
 * Next 16 delivers route params as a Promise, and every `[id]` handler needs the same
 * three lines, so they live here rather than being repeated per route file.
 */
export async function readIdParam(params: Promise<{ id: string }>) {
  return idParamSchema.parse((await params).id);
}

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

/**
 * Activity settings, discriminated on `type`.
 *
 * A Wordle and a Word Search need genuinely different configuration, so the union
 * enforces each shape independently instead of leaving every column optional and hoping
 * callers fill in the right subset. Both members are `.strict()`, so sending `gridSize`
 * on a Wordle is reported rather than silently dropped.
 */
const activityShared = {
  name: text(80),
  difficulty: z.enum(DIFFICULTIES),
  wordListId: z
    .number({ error: "wordListId must be a number" })
    .int()
    .positive(),
  symbolDisplay: z.enum(SYMBOL_DISPLAYS).optional(),
  showTooltips: z.boolean().optional(),
  theme: z.enum(THEMES).optional(),
};

export const activityCreateSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("wordle"),
      ...activityShared,
      maxGuesses: z.number().int().min(1).max(12),
      /** Phoneme count of the target word; decides which words in the list are eligible. */
      wordLength: z.number().int().min(1).max(12),
    })
    .strict(),
  z
    .object({
      type: z.literal("word_search"),
      ...activityShared,
      /** IPA symbol of the sound being practised, e.g. "/s/". */
      targetPhoneme: text(16),
      gridSize: z.number().int().min(4).max(20),
      /** Omit for a random grid; set to reproduce a specific one. */
      seed: z.number().int().nullish(),
      wordCount: z.number().int().min(1).max(50),
    })
    .strict(),
]);

/**
 * Incoming PATCH body. `type` is deliberately absent — changing an activity from a
 * Wordle into a Word Search would invalidate every setting on it, so callers delete and
 * recreate instead. The patch is merged onto the stored row and the result re-validated
 * against `activityCreateSchema`, so an update is held to exactly the same rules as a
 * create.
 */
export const activityPatchSchema = z
  .object({
    name: text(80),
    difficulty: z.enum(DIFFICULTIES),
    wordListId: z.number().int().positive(),
    symbolDisplay: z.enum(SYMBOL_DISPLAYS),
    showTooltips: z.boolean(),
    theme: z.enum(THEMES),
    maxGuesses: z.number().int().min(1).max(12),
    wordLength: z.number().int().min(1).max(12),
    targetPhoneme: text(16),
    gridSize: z.number().int().min(4).max(20),
    seed: z.number().int().nullish(),
    wordCount: z.number().int().min(1).max(50),
  })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    error: "Provide at least one field to update.",
  });

export const activityQuerySchema = z.object({
  type: z.enum(ACTIVITY_TYPES).optional(),
  difficulty: z.enum(DIFFICULTIES).optional(),
  wordListId: z.coerce.number().int().positive().optional(),
});

export type ActivityCreateInput = z.infer<typeof activityCreateSchema>;

export const generateQuerySchema = z.object({
  /** Pin a specific Wordle target instead of drawing one at random. */
  wordId: z.coerce.number().int().positive().optional(),
  /** Override the activity's stored Word Search seed for this request. */
  seed: z.coerce.number().int().optional(),
});

