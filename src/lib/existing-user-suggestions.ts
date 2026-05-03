import { prisma } from "@/lib/prisma";
import { normalizeEmail, normalizePhone, normalizeText } from "@/lib/private-duplicate-matches";

export interface ExistingUserSuggestionInput {
  name: string;
  email?: string | null;
  phoneNumber?: string | null;
  handle?: string | null;
}

export interface ExistingUserSuggestion {
  kind: "existing-user";
  user: {
    id: string;
    name: string | null;
    handle: string | null;
  };
  message: string;
  reason: "email" | "phone" | "handle" | "name";
}

function normalizeHandle(value?: string | null) {
  return normalizeText(value).replace(/^@/, "");
}

export async function findExistingUserSuggestion(
  input: ExistingUserSuggestionInput,
  currentDbUserId: string,
): Promise<ExistingUserSuggestion | null> {
  const normalizedEmail = normalizeEmail(input.email);
  const normalizedPhoneNumber = normalizePhone(input.phoneNumber);
  const normalizedHandle = normalizeHandle(input.handle);
  const normalizedName = normalizeText(input.name);

  if (
    !normalizedEmail &&
    !normalizedPhoneNumber &&
    !normalizedHandle &&
    normalizedName.length < 3
  ) {
    return null;
  }

  const candidates = await prisma.user.findMany({
    where: {
      id: { not: currentDbUserId },
      OR: [
        ...(normalizedEmail ? [{ email: { equals: normalizedEmail, mode: "insensitive" as const } }] : []),
        ...(normalizedPhoneNumber ? [{ phoneNumber: input.phoneNumber?.trim() }] : []),
        ...(normalizedHandle ? [{ handle: { equals: normalizedHandle, mode: "insensitive" as const } }] : []),
        ...(normalizedName.length >= 3
          ? [{ name: { equals: input.name.trim(), mode: "insensitive" as const } }]
          : []),
      ],
    },
    select: {
      id: true,
      name: true,
      handle: true,
      email: true,
      phoneNumber: true,
    },
    orderBy: [{ featured: "desc" }, { createdAt: "desc" }],
    take: 8,
  });

  const match = candidates
    .map((candidate) => {
      const candidateEmail = normalizeEmail(candidate.email);
      const candidatePhone = normalizePhone(candidate.phoneNumber);
      const candidateHandle = normalizeHandle(candidate.handle);
      const candidateName = normalizeText(candidate.name);

      if (normalizedEmail && candidateEmail === normalizedEmail) {
        return { candidate, reason: "email" as const, score: 4 };
      }

      if (normalizedPhoneNumber && candidatePhone === normalizedPhoneNumber) {
        return { candidate, reason: "phone" as const, score: 4 };
      }

      if (normalizedHandle && candidateHandle === normalizedHandle) {
        return { candidate, reason: "handle" as const, score: 3 };
      }

      if (normalizedName.length >= 3 && candidateName === normalizedName) {
        return { candidate, reason: "name" as const, score: 2 };
      }

      return null;
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((a, b) => b.score - a.score)[0];

  if (!match) {
    return null;
  }

  return {
    kind: "existing-user",
    user: {
      id: match.candidate.id,
      name: match.candidate.name,
      handle: match.candidate.handle,
    },
    reason: match.reason,
    message:
      match.reason === "name"
        ? "A Chart user already has this name. If this is them, you can connect with their public node instead."
        : "This contact already appears to be a Chart user. You can keep this as a private node, but consider adding a public connection too.",
  };
}
