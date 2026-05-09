import { config as loadEnv } from "dotenv";
import { prisma } from "../src/lib/prisma";

loadEnv({ path: ".env.local" });
loadEnv();

const TEST_CONNECTIONS = [
  {
    id: "test-user-jules-vance",
    name: "Jules Vance",
    handle: "jules.vance.test",
    clerkId: "test-jules-vance",
    email: "jules.vance.test@example.com",
  },
  {
    id: "test-user-ivy-mercer",
    name: "Ivy Mercer",
    handle: "ivy.mercer.test",
    clerkId: "test-ivy-mercer",
    email: "ivy.mercer.test@example.com",
  },
  {
    id: "test-user-mara-sol",
    name: "Mara Sol",
    handle: "mara.sol.test",
    clerkId: "test-mara-sol",
    email: "mara.sol.test@example.com",
  },
] as const;

type CliArgs = {
  forValue: string | null;
  type: "Talking" | "Dating" | "Situationship" | "Exes" | "Married" | "Sneaky Link" | "Lovers" | "One Night Stand" | "complicated" | "FWB";
};

function parseArgs(argv: string[]): CliArgs {
  let forValue: string | null = null;
  let type: CliArgs["type"] = "Talking";

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--for") {
      const next = argv[i + 1];
      if (next) {
        forValue = next;
        i += 1;
      }
      continue;
    }

    if (arg === "--type") {
      const next = argv[i + 1] as CliArgs["type"] | undefined;
      if (next) {
        type = next;
        i += 1;
      }
    }
  }

  return { forValue, type };
}

function pendingType(baseType: string, requesterId: string, responderId: string) {
  return `pending::${baseType}::${requesterId}::${responderId}`;
}

async function resolveOwnerUser(forValue: string | null) {
  const baseSelect = {
    id: true,
    name: true,
    handle: true,
    email: true,
    clerkId: true,
  } as const;

  if (!forValue) {
    return prisma.user.findFirst({
      orderBy: { updatedAt: "desc" },
      select: baseSelect,
    });
  }

  return prisma.user.findFirst({
    where: {
      OR: [
        { id: forValue },
        { clerkId: forValue },
        { handle: forValue },
        { email: forValue },
      ],
    },
    select: baseSelect,
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const owner = await resolveOwnerUser(args.forValue);
  if (!owner) {
    throw new Error("Could not find a target user. Use --for <id|handle|email|clerkId>.");
  }

  const fakeUsers = [] as { id: string; name: string }[];

  for (const candidate of TEST_CONNECTIONS) {
    const rows = await prisma.$queryRaw<Array<{ id: string; name: string | null }>>`
      INSERT INTO "User" ("id", "clerkId", "name", "handle", "email", "createdAt", "updatedAt")
      VALUES (${candidate.id}, ${candidate.clerkId}, ${candidate.name}, ${candidate.handle}, ${candidate.email}, NOW(), NOW())
      ON CONFLICT ("clerkId")
      DO UPDATE SET
        "name" = EXCLUDED."name",
        "handle" = EXCLUDED."handle",
        "email" = EXCLUDED."email",
        "updatedAt" = NOW()
      RETURNING "id", "name";
    `;

    if (!rows[0]?.id) {
      throw new Error(`Failed to upsert fake user ${candidate.name}`);
    }

    fakeUsers.push({ id: rows[0].id, name: rows[0].name ?? candidate.name });
  }

  for (const fakeUser of fakeUsers) {
    const [user1Id, user2Id] = [owner.id, fakeUser.id].sort();

    await prisma.relationship.upsert({
      where: {
        user1Id_user2Id: {
          user1Id,
          user2Id,
        },
      },
      update: {
        type: pendingType(args.type, owner.id, fakeUser.id),
      },
      create: {
        user1Id,
        user2Id,
        type: pendingType(args.type, owner.id, fakeUser.id),
      },
    });
  }

  console.log(`Seeded ${fakeUsers.length} pending test connections for ${owner.name ?? owner.handle ?? owner.id}.`);
  console.log(`Owner id: ${owner.id}`);
  console.log("Connections:", fakeUsers.map((user) => user.name).join(", "));
}

main()
  .catch((error) => {
    console.error("Failed to seed fake pending connections", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
