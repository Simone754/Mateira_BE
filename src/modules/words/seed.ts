import { isPrismaError } from "../../lib/prismaErrors";
import { prisma } from "../../plugins/prisma";
import { nextPosition, parseWordCreate } from "./service";
import { WORD_SEEDS, type WordSeed } from "./seedData";

export type SeedOutcome = { term: string; page: string; outcome: "created" | "existing" };

/**
 * Creates the words of `seeds` that are missing (no word with the same term on the same page). A word that exists is
 * never touched, so the changes made from the admin panel survive every later run.
 */
export async function seedWords(seeds: readonly WordSeed[] = WORD_SEEDS): Promise<SeedOutcome[]> {
  const outcomes: SeedOutcome[] = [];

  for (const seed of seeds) {
    // The same rules as the API: a seed that breaks them is a mistake in the data, not something to store.
    const input = parseWordCreate({ ...seed });
    const result = (outcome: SeedOutcome["outcome"]): SeedOutcome => ({ term: input.term, page: input.page, outcome });

    const existing = await prisma.word.findUnique({
      where: { page_term: { page: input.page, term: input.term } },
      select: { id: true },
    });
    if (existing) {
      outcomes.push(result("existing"));
      continue;
    }

    try {
      await prisma.word.create({
        data: {
          term: input.term,
          etymology: input.etymology,
          meaning: input.meaning,
          closing: input.closing,
          page: input.page,
          position: await nextPosition(input.page),
          status: input.status,
          publishedAt: input.status === "PUBLISHED" ? new Date() : null,
        },
      });
      outcomes.push(result("created"));
    } catch (err) {
      // A concurrent run created it between the lookup and the create.
      if (!isPrismaError(err, "P2002")) throw err;
      outcomes.push(result("existing"));
    }
  }

  return outcomes;
}
