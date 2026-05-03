/* eslint-disable @typescript-eslint/no-require-imports */
const { Client } = require("pg");

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("No DATABASE_URL set in env");
    process.exit(1);
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    const stmts = [
      `CREATE TABLE IF NOT EXISTS "PrivateConnectionEdge" (
        id TEXT PRIMARY KEY,
        ownerId TEXT NOT NULL,
        sourcePlaceholderId TEXT NOT NULL,
        targetPlaceholderId TEXT NOT NULL,
        relationshipType TEXT NOT NULL,
        note TEXT,
        createdAt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`,

      `CREATE TABLE IF NOT EXISTS "PrivateConfirmedConnectionEdge" (
        id TEXT PRIMARY KEY,
        ownerId TEXT NOT NULL,
        sourceUserId TEXT NOT NULL,
        targetUserId TEXT NOT NULL,
        relationshipType TEXT NOT NULL,
        note TEXT,
        createdAt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`,

      `CREATE TABLE IF NOT EXISTS "PrivateMixedConnectionEdge" (
        id TEXT PRIMARY KEY,
        ownerId TEXT NOT NULL,
        placeholderId TEXT NOT NULL,
        userId TEXT NOT NULL,
        relationshipType TEXT NOT NULL,
        note TEXT,
        createdAt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`,
    ];

    for (const s of stmts) {
      console.log("Running:", s.split("\n")[0]);
      await client.query(s);
    }

    console.log("Done creating private tables (if they did not exist).");
  } catch (e) {
    console.error("Error creating tables", e);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
