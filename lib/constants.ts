/**
 * Values that SQLite cannot enforce for us.
 *
 * Prisma has no enum support on SQLite, so `Activity.type`, `Activity.difficulty` and
 * `Activity.symbolDisplay` are plain String columns. These constants are the single
 * source of truth for what those columns may contain — they drive both the TypeScript
 * unions and the Zod schemas that guard every write.
 */

export const ACTIVITY_TYPES = ["wordle", "word_search"] as const;

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const SYMBOL_DISPLAYS = ["ipa", "english"] as const;

export const THEMES = ["light", "dark"] as const;
