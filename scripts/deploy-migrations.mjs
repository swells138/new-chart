import { spawnSync } from "node:child_process";

const repairedMigrationName = "20260503000000_private_web_edges";

if (!process.env.DATABASE_URL) {
  console.log("DATABASE_URL is not set; skipping prisma migrate deploy.");
  process.exit(0);
}

function runPrisma(args, options = {}) {
  return spawnSync("npx", ["prisma", ...args], {
    encoding: "utf8",
    shell: process.platform === "win32",
    ...options,
  });
}

function printResultOutput(result) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

let result = runPrisma(["migrate", "deploy"]);
printResultOutput(result);

const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
const shouldResolveKnownFailure =
  result.status !== 0 &&
  output.includes("P3009") &&
  output.includes(repairedMigrationName);

if (shouldResolveKnownFailure) {
  console.log(
    `Marking failed ${repairedMigrationName} migration as rolled back before retrying.`,
  );

  const resolveResult = runPrisma([
    "migrate",
    "resolve",
    "--rolled-back",
    repairedMigrationName,
  ]);
  printResultOutput(resolveResult);

  if (resolveResult.status !== 0) {
    process.exit(resolveResult.status ?? 1);
  }

  result = runPrisma(["migrate", "deploy"]);
  printResultOutput(result);
}

process.exit(result.status ?? 1);
