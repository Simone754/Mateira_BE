import { loadEnv } from "../config/env";
import { seedWords } from "../modules/words/seed";
import { pool, prisma } from "../plugins/prisma";

loadEnv();

async function main() {
  const outcomes = await seedWords();
  for (const { term, page, outcome } of outcomes) {
    console.log(`${term} (${page}): ${outcome === "created" ? "creata" : "già presente"}`);
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
