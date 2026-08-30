import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

let container: StartedPostgreSqlContainer | undefined;

export default async function setup() {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  const url = container.getConnectionUri();

  const migrationClient = postgres(url, { max: 1 });
  await migrate(drizzle(migrationClient), {
    migrationsFolder: join(__dirname, "..", "src", "db", "migrations"),
  });
  await migrationClient.end();

  process.env.TEST_DATABASE_URL = url;

  return async () => {
    await container?.stop();
  };
}
