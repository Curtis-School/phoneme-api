import { prisma } from "@/lib/prisma";
import { ok, parseQuery, withErrorHandling } from "@/lib/http";
import { phonemeListQuerySchema } from "@/lib/validation";

/** GET /api/phonemes — the full inventory, optionally filtered by `?search=`. */
export const GET = withErrorHandling(async (request: Request) => {
  const { search } = parseQuery(request, phonemeListQuerySchema);

  const phonemes = await prisma.phoneme.findMany({
    where: search
      ? {
          OR: [
            { ipa: { contains: search } },
            { label: { contains: search } },
            { english: { contains: search } },
            { example: { contains: search } },
          ],
        }
      : undefined,
    orderBy: { id: "asc" },
  });

  return ok(phonemes);
});
