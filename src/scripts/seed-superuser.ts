import { loadEnv } from "../config/env";
import { ensureSuperuser } from "../modules/auth/service";
import { pool, prisma } from "../plugins/prisma";

loadEnv();

async function main() {
  const email = process.env.SUPERUSER_EMAIL;
  const password = process.env.SUPERUSER_PASSWORD;
  if (!email || !password) {
    throw new Error("SUPERUSER_EMAIL and SUPERUSER_PASSWORD are required");
  }

  const user = await ensureSuperuser(email, password);
  console.log(`Superuser ready: ${user.email}`);
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
