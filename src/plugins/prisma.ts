import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { loadEnv } from "../config/env";

loadEnv();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required in the environment or .env file");
}

export const pool = new Pool({ connectionString: databaseUrl });
const adapter = new PrismaPg(pool);
export const prisma = new PrismaClient({ adapter });
