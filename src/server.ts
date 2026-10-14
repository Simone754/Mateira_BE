import { createApp } from "./app";
import { DOCS_ENABLED, PORT } from "./config/settings";
import { formatStartupBanner } from "./lib/startupBanner";
import { pool, prisma } from "./plugins/prisma";

const server = createApp();

server.listen(PORT, () => {
  console.log(formatStartupBanner({ baseUrl: `http://localhost:${PORT}`, docsEnabled: DOCS_ENABLED }));
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down`);

  const force = setTimeout(() => {
    console.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10_000);
  force.unref();

  try {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    await prisma.$disconnect();
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
