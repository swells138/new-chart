import { config as loadEnv } from "dotenv";
import { prisma } from "../src/lib/prisma";

loadEnv({ path: ".env.local" });
loadEnv();

const DEV_USER_TERMS = ["holly", "sydney"];

async function main() {
  const testPlaceholderResult = await prisma.placeholderPerson.deleteMany({
    where: {
      OR: [
        { name: { contains: "test node", mode: "insensitive" as const } },
        { name: { startsWith: "test", mode: "insensitive" as const } },
        ...DEV_USER_TERMS.map((term) => ({
          name: { contains: term, mode: "insensitive" as const },
        })),
      ],
    },
  });

  const devUserResult = await prisma.user.deleteMany({
    where: {
      OR: [
        ...DEV_USER_TERMS.map((term) => ({
          name: { contains: term, mode: "insensitive" as const },
        })),
        ...DEV_USER_TERMS.map((term) => ({
          handle: { contains: term, mode: "insensitive" as const },
        })),
        ...DEV_USER_TERMS.map((term) => ({
          clerkId: { contains: term, mode: "insensitive" as const },
        })),
      ],
    },
  });

  console.log(`Removed ${testPlaceholderResult.count} test placeholders.`);
  console.log(`Removed ${devUserResult.count} dev users (Holly/Sydney variants).`);
}

main()
  .catch((error) => {
    console.error("Failed to clean dev data", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
