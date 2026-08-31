import { ok, parseQuery, withErrorHandling } from "@/lib/http";
import {
  buildWordleConfig,
  buildWordSearchConfig,
  loadActivityForGenerate,
} from "@/lib/generate";
import { generateQuerySchema, readIdParam } from "@/lib/validation";

type Context = RouteContext<"/api/activities/[id]/generate">;

/**
 * GET /api/activities/:id/generate
 *
 * Turns a saved activity into everything the builder needs to render and export it. The
 * `config` object matches the frontend's `WordleConfig` / `WordSearchConfig` exactly, so
 * it can be handed to the existing components and HTML exporters unchanged.
 *
 * Read-only: repeated calls produce fresh puzzles and record nothing.
 */
export const GET = withErrorHandling(async (request: Request, ctx: Context) => {
  const id = await readIdParam(ctx.params);

  const { wordId, seed } = parseQuery(request, generateQuerySchema);

  const activity = await loadActivityForGenerate(id);

  const base = {
    activity: {
      id: activity.id,
      name: activity.name,
      type: activity.type,
      difficulty: activity.difficulty,
      wordList: { id: activity.wordList.id, name: activity.wordList.name },
    },
    // Exactly the frontend's `ActivitySettings`.
    settings: {
      theme: activity.theme,
      symbolDisplay: activity.symbolDisplay,
      showTooltips: activity.showTooltips,
    },
  };

  if (activity.type === "wordle") {
    const { config, wordId: chosen } = buildWordleConfig(activity, wordId);

    // `wordId` is echoed back so the exact puzzle can be requested again.
    return ok({ ...base, config, wordId: chosen });
  }

  const { config, seed: usedSeed } = buildWordSearchConfig(activity, seed);

  // The seed is returned so the caller can pass it to the grid generator and reproduce
  // this activity later.
  return ok({ ...base, config, seed: usedSeed });
});
