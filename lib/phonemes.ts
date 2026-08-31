/**
 * The phoneme shapes every serialiser shares.
 *
 * These live apart from `words.ts` and `generate.ts` because both need them and this
 * module imports nothing — four hand-written copies of the same five fields is how they
 * drift out of step.
 */

/** A phoneme row as stored. */
export type PhonemeRow = {
  id: number;
  ipa: string;
  label: string;
  example: string;
  english: string;
};

/** The frontend's `Phoneme`: the content fields only, no id and no timestamps. */
export type PhonemeDto = Omit<PhonemeRow, "id">;

export function toPhonemeDto({ ipa, label, example, english }: PhonemeRow): PhonemeDto {
  return { ipa, label, example, english };
}
