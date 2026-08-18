import { prisma } from "@/lib/prisma";
import { created, ok, parseJsonBody, withErrorHandling } from "@/lib/http";
import { phonemeCreateSchema, phonemeListQuerySchema } from "@/lib/validation";

/** GET /api/phonemes — the full inventory, optionally filtered by `?search=`. */
export const GET = withErrorHandling(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const { search } = phonemeListQuerySchema.parse({
    search: searchParams.get("search") ?? undefined,
  });

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

/** POST /api/phonemes — add a phoneme to the inventory. */
export const POST = withErrorHandling(async (request: Request) => {
  const data = await parseJsonBody(request, phonemeCreateSchema);

  // A duplicate `ipa` raises P2002, which withErrorHandling turns into a 409.
  const phoneme = await prisma.phoneme.create({ data });

  return created(phoneme);
});
