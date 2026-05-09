import type { RelationshipType } from "@/types/models";

export const pendingTypePrefix = "pending::";
const metaPrefix = "[[meta:";
const metaSuffix = "]]";
const msPerDay = 24 * 60 * 60 * 1000;

export type ClaimFlowStatus =
  | "pending_claim"
  | "pending_creator_confirmation"
  | "active"
  | "rejected"
  | "expired"
  | "disputed";

export interface RelationshipClaimMeta {
  status: ClaimFlowStatus;
  creatorId: string;
  claimedByUserId: string;
  claimConfirmedAt: string | null;
  expiresAt: string | null;
  disputeReason: string | null;
}

export function encodePendingType(
  baseType: RelationshipType,
  creatorId: string,
  claimedByUserId: string,
) {
  return `${pendingTypePrefix}${baseType}::${creatorId}::${claimedByUserId}`;
}

export function parseStoredRelationshipType(
  storedType: string,
  fallbackCreatorId: string,
  fallbackClaimedByUserId: string,
): {
  isPendingType: boolean;
  baseType: RelationshipType;
  creatorId: string;
  claimedByUserId: string;
} {
  if (!storedType.startsWith(pendingTypePrefix)) {
    return {
      isPendingType: false,
      baseType: storedType as RelationshipType,
      creatorId: fallbackCreatorId,
      claimedByUserId: fallbackClaimedByUserId,
    };
  }

  const [, rawBaseType = "Talking", creatorId = fallbackCreatorId, claimedByUserId = fallbackClaimedByUserId] =
    storedType.split("::");

  return {
    isPendingType: true,
    baseType: rawBaseType as RelationshipType,
    creatorId,
    claimedByUserId,
  };
}

export function buildClaimMetaNote(meta: RelationshipClaimMeta) {
  return `${metaPrefix}${JSON.stringify(meta)}${metaSuffix}`;
}

function toIsoOrNull(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return null;
  }

  return new Date(timestamp).toISOString();
}

export function parseClaimMetaFromNote(
  note: string | null | undefined,
): Partial<RelationshipClaimMeta> {
  const raw = note ?? "";

  if (!raw.startsWith(metaPrefix)) {
    return {};
  }

  const endIndex = raw.indexOf(metaSuffix);
  if (endIndex === -1) {
    return {};
  }

  try {
    const meta = JSON.parse(raw.slice(metaPrefix.length, endIndex)) as {
      status?: string;
      creatorId?: string;
      claimedByUserId?: string;
      requesterId?: string;
      responderId?: string;
      claimConfirmedAt?: string;
      expiresAt?: string;
      disputeReason?: string;
    };

    const status =
      meta.status === "pending"
        ? "pending_claim"
        : meta.status === "pending_claim" ||
            meta.status === "pending_creator_confirmation" ||
            meta.status === "active" ||
            meta.status === "rejected" ||
            meta.status === "expired" ||
            meta.status === "disputed"
          ? meta.status
          : undefined;

    return {
      status,
      creatorId: meta.creatorId ?? meta.requesterId,
      claimedByUserId: meta.claimedByUserId ?? meta.responderId,
      claimConfirmedAt: toIsoOrNull(meta.claimConfirmedAt),
      expiresAt: toIsoOrNull(meta.expiresAt),
      disputeReason:
        typeof meta.disputeReason === "string" && meta.disputeReason.trim().length > 0
          ? meta.disputeReason.trim()
          : null,
    };
  } catch {
    return {};
  }
}

export function composeClaimMeta(
  args: {
    storedType: string;
    user1Id: string;
    user2Id: string;
    note: string | null | undefined;
  },
): RelationshipClaimMeta {
  const parsedType = parseStoredRelationshipType(
    args.storedType,
    args.user1Id,
    args.user2Id,
  );
  const parsedNote = parseClaimMetaFromNote(args.note);

  const statusFromType: ClaimFlowStatus = parsedType.isPendingType
    ? "pending_claim"
    : "active";

  const status = parsedNote.status ?? statusFromType;
  const creatorId = parsedNote.creatorId ?? parsedType.creatorId;
  const claimedByUserId = parsedNote.claimedByUserId ?? parsedType.claimedByUserId;
  const claimConfirmedAt = parsedNote.claimConfirmedAt ?? null;
  const computedExpiresAt = claimConfirmedAt
    ? new Date(Date.parse(claimConfirmedAt) + 7 * msPerDay).toISOString()
    : null;
  const expiresAt = parsedNote.expiresAt ?? computedExpiresAt;

  return {
    status,
    creatorId,
    claimedByUserId,
    claimConfirmedAt,
    expiresAt,
    disputeReason: parsedNote.disputeReason ?? null,
  };
}

export function hasExpiredPendingConfirmation(meta: RelationshipClaimMeta, now = new Date()) {
  if (meta.status !== "pending_creator_confirmation") {
    return false;
  }

  if (!meta.expiresAt) {
    return false;
  }

  const expiresAtMs = Date.parse(meta.expiresAt);
  if (Number.isNaN(expiresAtMs)) {
    return false;
  }

  return expiresAtMs <= now.getTime();
}
