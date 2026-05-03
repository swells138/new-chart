import { spawnSync } from "node:child_process";

const repairedMigrationName = "20260503000000_private_web_edges";
const advisoryLockRetryDelaysMs = [3000, 7000, 12000];

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

function getOutput(result) {
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

function isAdvisoryLockTimeout(result) {
  const output = getOutput(result);
  return (
    result.status !== 0 &&
    output.includes("P1002") &&
    output.includes("Timed out trying to acquire a postgres advisory lock")
  );
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function runMigrateDeployWithRetries() {
  let result = runPrisma(["migrate", "deploy"]);
  printResultOutput(result);

  for (const [index, delayMs] of advisoryLockRetryDelaysMs.entries()) {
    if (!isAdvisoryLockTimeout(result)) {
      return result;
    }

    console.log(
      `Prisma advisory lock timed out; retrying migrate deploy in ${Math.round(
        delayMs / 1000,
      )}s (${index + 1}/${advisoryLockRetryDelaysMs.length}).`,
    );
    sleep(delayMs);

    result = runPrisma(["migrate", "deploy"]);
    printResultOutput(result);
  }

  return result;
}

let result = runMigrateDeployWithRetries();

const output = getOutput(result);
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

  result = runMigrateDeployWithRetries();
}

process.exit(result.status ?? 1);
