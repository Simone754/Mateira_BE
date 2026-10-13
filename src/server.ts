import { createApp } from "./app";
import { PORT } from "./config/settings";
import { pool, prisma } from "./plugins/prisma";

const server = createApp();

server.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function shutdown() {
  server.close();
  await prisma.$disconnect();
  await pool.end();
  process.exit(0);
}
