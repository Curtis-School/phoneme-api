import { z } from "zod";

/**
 * Request schemas. Every write goes through one of these before it reaches Prisma.
 *
 * IPA symbols are validated as non-empty trimmed strings rather than by character
 * length: a phoneme such as /eː/ or /ɑe/ occupies several code points, so any rule
 * expressed in single characters would wrongly reject valid data.
 */

/** Trimmed, non-empty string with an upper bound to keep obvious junk out of the database. */
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

// Every field optional for PATCH, but at least one must be present — otherwise the
// request is a silent no-op and the caller has no way to tell.
export const phonemeUpdateSchema = phonemeCreateSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    error: "Provide at least one field to update.",
  });

export const phonemeListQuerySchema = z.object({
  search: z.string().trim().min(1).max(120).optional(),
});

export type PhonemeCreateInput = z.infer<typeof phonemeCreateSchema>;
export type PhonemeUpdateInput = z.infer<typeof phonemeUpdateSchema>;
