import { config as loadEnv } from "dotenv";
import { prisma } from "../src/lib/prisma";

loadEnv({ path: ".env.local" });
loadEnv();

const RELATIONSHIP_TYPES = [
  "Talking",
  "Dating",
  "Situationship",
  "Exes",
  "Married",
  "Sneaky Link",
  "Lovers",
  "One Night Stand",
  "complicated",
  "FWB",
] as const;

type RelationshipExampleType = typeof RELATIONSHIP_TYPES[number];

const EXAMPLE_CONNECTIONS = [
  {
    id: "example-user-jules-vance",
    name: "Jules Vance",
    handle: "jules.afterhours",
    clerkId: "example-jules-vance",
    email: "jules.afterhours@example.com",
    relationshipType: "Sneaky Link",
    note: "Met after a basement show and kept pretending the 2am coffee runs were accidental.",
  },
  {
    id: "example-user-ivy-mercer",
    name: "Ivy Mercer",
    handle: "ivy.greenroom",
    clerkId: "example-ivy-mercer",
    email: "ivy.greenroom@example.com",
    relationshipType: "Situationship",
    note: "Swore it was just a set-design collab, then spent three weekends rearranging each other's living rooms.",
  },
  {
    id: "example-user-mara-sol",
    name: "Mara Sol",
    handle: "mara.hotmic",
    clerkId: "example-mara-sol",
    email: "mara.hotmic@example.com",
    relationshipType: "FWB",
    note: "Started with guest DJ swaps, escalated into Sunday breakfast and mutually assured playlist chaos.",
  },
  {
    id: "example-user-noa-kline",
    name: "Noa Kline",
    handle: "noa.rooftop",
    clerkId: "example-noa-kline",
    email: "noa.rooftop@example.com",
    relationshipType: "Talking",
    note: "Rooftop garden flirting with enough inside jokes to qualify as its own weather system.",
  },
  {
    id: "example-user-dani-park",
    name: "Dani Park",
    handle: "dani.afterparty",
    clerkId: "example-dani-park",
    email: "dani.afterparty@example.com",
    relationshipType: "One Night Stand",
    note: "An afterparty spark, one legendary rideshare, and a mutual agreement to keep the story cinematic.",
  },
] as const satisfies ReadonlyArray<{
  id: string;
  name: string;
  handle: string;
  clerkId: string;
  email: string;
  relationshipType: RelationshipExampleType;
  note: string;
}>;

type CliArgs = {
  forValue: string | null;
  type: RelationshipExampleType | null;
};

function parseArgs(argv: string[]): CliArgs {
  let forValue: string | null = null;
  let type: CliArgs["type"] = null;

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
      const next = argv[i + 1] as RelationshipExampleType | undefined;
      if (next) {
        type = next;
        i += 1;
      }
    }
  }

  if (type && !RELATIONSHIP_TYPES.includes(type)) {
    throw new Error(`Unsupported relationship type "${type}".`);
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

  const exampleUsers = [] as {
    id: string;
    name: string;
    relationshipType: RelationshipExampleType;
    note: string;
  }[];

  for (const candidate of EXAMPLE_CONNECTIONS) {
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
      throw new Error(`Failed to upsert example user ${candidate.name}`);
    }

    exampleUsers.push({
      id: rows[0].id,
      name: rows[0].name ?? candidate.name,
      relationshipType: args.type ?? candidate.relationshipType,
      note: candidate.note,
    });
  }

  for (const exampleUser of exampleUsers) {
    const [user1Id, user2Id] = [owner.id, exampleUser.id].sort();

    await prisma.relationship.upsert({
      where: {
        user1Id_user2Id: {
          user1Id,
          user2Id,
        },
      },
      update: {
        type: pendingType(exampleUser.relationshipType, owner.id, exampleUser.id),
        note: exampleUser.note,
      },
      create: {
        user1Id,
        user2Id,
        type: pendingType(exampleUser.relationshipType, owner.id, exampleUser.id),
        note: exampleUser.note,
      },
    });
  }

  console.log(`Seeded ${exampleUsers.length} pending example connections for ${owner.name ?? owner.handle ?? owner.id}.`);
  console.log(`Owner id: ${owner.id}`);
  console.log("Connections:", exampleUsers.map((user) => user.name).join(", "));
}

main()
  .catch((error) => {
    console.error("Failed to seed example pending connections", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
