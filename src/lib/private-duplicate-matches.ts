import type { PlaceholderPerson } from "@/types/models";

export interface PrivateDuplicateCandidate {
  id: string;
  ownerId: string;
  name: string;
  email: string | null;
  phoneNumber: string | null;
  relationshipType: string;
  note: string | null;
  claimStatus: string;
  createdAt: Date | string;
  linkedUser?: {
    handle: string | null;
    location: string | null;
    email: string | null;
    phoneNumber: string | null;
  } | null;
}

export interface PrivateDuplicateInput {
  name: string;
  email?: string | null;
  phoneNumber?: string | null;
  location?: string | null;
  handle?: string | null;
}

export interface PrivateDuplicateMatch {
  id: string;
  name: string;
  email: string;
  phoneNumber: string;
  location: string;
  handle: string;
  relationshipType: PlaceholderPerson["relationshipType"];
  note: string;
  claimStatus: PlaceholderPerson["claimStatus"];
  createdAt: string;
  score: number;
  reasons: string[];
}

export function normalizeEmail(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

export function normalizePhone(value?: string | null) {
  return value?.replace(/\D/g, "") ?? "";
}

export function normalizeText(value?: string | null) {
  return value?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
}

function nameTokens(value: string) {
  return normalizeText(value)
    .split(" ")
    .map((token) => token.replace(/[^a-z0-9]/g, ""))
    .filter((token) => token.length >= 2);
}

function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = Array.from({ length: b.length + 1 }, () => 0);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost,
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[b.length];
}

function nameSimilarity(a: string, b: string) {
  const left = normalizeText(a);
  const right = normalizeText(b);
  if (!left || !right) return 0;
  if (left === right) return 1;

  const leftTokens = nameTokens(left);
  const rightTokens = nameTokens(right);
  const leftSet = new Set(leftTokens);
  const sharedTokens = rightTokens.filter((token) => leftSet.has(token)).length;
  const tokenScore =
    Math.max(leftTokens.length, rightTokens.length) > 0
      ? sharedTokens / Math.max(leftTokens.length, rightTokens.length)
      : 0;

  const maxLength = Math.max(left.length, right.length);
  const editScore =
    maxLength > 0 ? 1 - levenshtein(left, right) / maxLength : 0;

  return Math.max(tokenScore, editScore);
}

function formatDate(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}

export function findPrivateDuplicateMatches(
  input: PrivateDuplicateInput,
  candidates: PrivateDuplicateCandidate[],
): PrivateDuplicateMatch[] {
  const inputEmail = normalizeEmail(input.email);
  const inputPhone = normalizePhone(input.phoneNumber);
  const inputLocation = normalizeText(input.location);
  const inputHandle = normalizeText(input.handle).replace(/^@/, "");

  return candidates
    .map((candidate) => {
      const candidateEmail =
        normalizeEmail(candidate.email) ||
        normalizeEmail(candidate.linkedUser?.email);
      const candidatePhone =
        normalizePhone(candidate.phoneNumber) ||
        normalizePhone(candidate.linkedUser?.phoneNumber);
      const candidateLocation = normalizeText(candidate.linkedUser?.location);
      const candidateHandle = normalizeText(candidate.linkedUser?.handle).replace(
        /^@/,
        "",
      );
      const similarity = nameSimilarity(input.name, candidate.name);
      const reasons: string[] = [];
      let score = 0;

      if (inputEmail && candidateEmail && inputEmail === candidateEmail) {
        score += 100;
        reasons.push("Exact email match");
      }

      if (inputPhone && candidatePhone && inputPhone === candidatePhone) {
        score += 100;
        reasons.push("Exact phone match");
      }

      if (inputHandle && candidateHandle && inputHandle === candidateHandle) {
        score += 70;
        reasons.push("Matching handle");
      }

      if (similarity >= 0.92) {
        score += 64;
        reasons.push("Very similar name");
      } else if (similarity >= 0.72) {
        score += 60;
        reasons.push("Similar name");
      }

      if (
        inputLocation &&
        candidateLocation &&
        (inputLocation === candidateLocation ||
          inputLocation.includes(candidateLocation) ||
          candidateLocation.includes(inputLocation))
      ) {
        score += similarity >= 0.55 ? 24 : 12;
        reasons.push("Location overlaps");
      }

      const isMatch =
        score >= 60 ||
        (similarity >= 0.72 &&
          Boolean(
            (inputEmail && candidateEmail) ||
              (inputPhone && candidatePhone) ||
              (inputLocation && candidateLocation) ||
              (inputHandle && candidateHandle),
          ));

      if (!isMatch) {
        return null;
      }

      return {
        id: candidate.id,
        name: candidate.name,
        email: candidate.email ?? candidate.linkedUser?.email ?? "",
        phoneNumber:
          candidate.phoneNumber ?? candidate.linkedUser?.phoneNumber ?? "",
        location: candidate.linkedUser?.location ?? "",
        handle: candidate.linkedUser?.handle ?? "",
        relationshipType:
          candidate.relationshipType as PlaceholderPerson["relationshipType"],
        note: candidate.note ?? "",
        claimStatus: candidate.claimStatus as PlaceholderPerson["claimStatus"],
        createdAt: formatDate(candidate.createdAt),
        score,
        reasons,
      };
    })
    .filter((match): match is PrivateDuplicateMatch => Boolean(match))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}
