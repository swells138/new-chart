import { config as loadEnv } from "dotenv";
import { prisma } from "../src/lib/prisma";
import postsData from "../src/data/posts.json";
import relationshipsData from "../src/data/relationships.json";
import usersData from "../src/data/users.json";

loadEnv({ path: ".env.local" });
loadEnv();

function parseRelativeTimestamp(timestamp: string) {
  const now = Date.now();

  if (timestamp.endsWith("h ago")) {
    const hours = Number.parseInt(timestamp, 10);
    return new Date(now - hours * 60 * 60 * 1000);
  }

  if (timestamp.endsWith("d ago")) {
    const days = Number.parseInt(timestamp, 10);
    return new Date(now - days * 24 * 60 * 60 * 1000);
  }

  return new Date(now);
}

async function main() {
  console.log("Seeding database...");

  for (const user of usersData) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: {
        clerkId: `seed-${user.id}`,
        name: user.name,
        handle: user.handle,
        email: `${user.handle}@example.com`,
        pronouns: user.pronouns,
        bio: user.bio,
        location: user.location,
        interests: user.interests,
        relationshipStatus: user.relationshipStatus,
        links: user.links,
        featured: user.featured,
      },
      create: {
        id: user.id,
        clerkId: `seed-${user.id}`,
        name: user.name,
        handle: user.handle,
        email: `${user.handle}@example.com`,
        pronouns: user.pronouns,
        bio: user.bio,
        location: user.location,
        interests: user.interests,
        relationshipStatus: user.relationshipStatus,
        links: user.links,
        featured: user.featured,
      },
    });
  }

  for (const post of postsData) {
    await prisma.post.upsert({
      where: { id: post.id },
      update: {
        userId: post.userId,
        content: post.content,
        timestamp: parseRelativeTimestamp(post.timestamp),
        tags: post.tags,
        likes: post.likes,
        comments: post.comments,
      },
      create: {
        id: post.id,
        userId: post.userId,
        content: post.content,
        timestamp: parseRelativeTimestamp(post.timestamp),
        tags: post.tags,
        likes: post.likes,
        comments: post.comments,
      },
    });
  }

  for (const relationship of relationshipsData) {
    await prisma.relationship.upsert({
      where: { id: relationship.id },
      update: {
        user1Id: relationship.source,
        user2Id: relationship.target,
        type: relationship.type,
        note: relationship.note,
      },
      create: {
        id: relationship.id,
        user1Id: relationship.source,
        user2Id: relationship.target,
        type: relationship.type,
        note: relationship.note,
      },
    });
  }

  console.log("Database seeding completed!");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
