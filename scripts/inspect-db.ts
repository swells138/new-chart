import { Client } from "pg";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("No DATABASE_URL set in env");
    process.exit(1);
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    console.log("Connected to DB. Listing tables in public schema:\n");
    const tablesRes = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;`,
    );
    const tables: string[] = tablesRes.rows.map(
      (r: { table_name: string }) => r.table_name,
    );
    for (const t of tables) {
      try {
        const cntRes = await client.query(
          `SELECT COUNT(*) as c FROM \"${t}\";`,
        );
        console.log(`${t}: ${cntRes.rows[0].c} rows`);
      } catch (e) {
        console.log(`${t}: could not count rows (${(e as Error).message})`);
      }
    }

    console.log("\nChecking for dropped-private tables and samples:\n");
    const checkTables = [
      "PrivateConfirmedConnectionEdge",
      "PrivateConnectionEdge",
      "PrivateMixedConnectionEdge",
    ];

    for (const t of checkTables) {
      const exists = tables.includes(t);
      console.log(`${t}: ${exists ? "exists" : "MISSING"}`);
      if (exists) {
        try {
          const rows = await client.query(`SELECT * FROM \"${t}\" LIMIT 5;`);
          console.log(`Sample rows for ${t}:`, rows.rows);
        } catch (e) {
          console.log(`Could not read ${t}: ${(e as Error).message}`);
        }
      }
    }

    console.log("\nInspecting users table columns and sample data:\n");
    const colRes = await client.query(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_name='User' OR table_name='user' ORDER BY column_name;`,
    );
    if (colRes.rows.length === 0) {
      console.log("No 'User' table found. Trying lowercase 'user'...\n");
      const colRes2 = await client.query(
        `SELECT column_name, data_type FROM information_schema.columns WHERE table_name='user' ORDER BY column_name;`,
      );
      console.log(colRes2.rows);
    } else {
      console.log(colRes.rows);
    }

    // Try to sample users
    const sampleRes = await client
      .query(
        'SELECT id, name, stripeCustomerId, stripeSubscriptionId, isPro FROM \"User\" LIMIT 10;',
      )
      .catch(async () => {
        // try lowercase
        return client.query(
          "SELECT id, name, stripeCustomerId, stripeSubscriptionId, isPro FROM user LIMIT 10;",
        );
      });

    console.log("\nSample users (up to 10):");
    console.log(sampleRes.rows);

    // check for duplicates on phoneNumber and stripeCustomerId
    console.log(
      "\nChecking for duplicate phoneNumber values (if column exists):",
    );
    const dupPhone = await client
      .query(
        `SELECT phoneNumber, COUNT(*) FROM \"User\" GROUP BY phoneNumber HAVING COUNT(*) > 1 LIMIT 20;`,
      )
      .catch(() => ({ rows: [] }));
    console.log(dupPhone.rows);

    console.log(
      "\nChecking for duplicate stripeCustomerId values (if column exists):",
    );
    const dupStripe = await client
      .query(
        `SELECT stripeCustomerId, COUNT(*) FROM \"User\" GROUP BY stripeCustomerId HAVING COUNT(*) > 1 LIMIT 20;`,
      )
      .catch(() => ({ rows: [] }));
    console.log(dupStripe.rows);

    console.log("\nDone.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
