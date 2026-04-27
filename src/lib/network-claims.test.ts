import { beforeEach, describe, expect, it, vi } from "vitest";

const transactionMock = vi.fn();
const messageCreateMock = vi.fn();

const prismaUserFindUniqueMock = vi.fn();
const prismaUserFindManyMock = vi.fn();
const placeholderFindManyMock = vi.fn();
const relationshipFindManyMock = vi.fn();
const placeholderFindUniqueMock = vi.fn();
const placeholderUpdateMock = vi.fn();
const relationshipFindFirstMock = vi.fn();
const relationshipCreateMock = vi.fn();
const relationshipUpdateMock = vi.fn();
const userFindUniqueMock = vi.fn();
const userUpdateMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: transactionMock,
    user: {
      findUnique: prismaUserFindUniqueMock,
      findMany: prismaUserFindManyMock,
    },
    placeholderPerson: {
      findMany: placeholderFindManyMock,
    },
    relationship: {
      findMany: relationshipFindManyMock,
    },
    message: {
      create: messageCreateMock,
    },
  },
}));

function makeTransactionClient() {
  return {
    placeholderPerson: {
      findUnique: placeholderFindUniqueMock,
      update: placeholderUpdateMock,
    },
    relationship: {
      findFirst: relationshipFindFirstMock,
      create: relationshipCreateMock,
      update: relationshipUpdateMock,
    },
    user: {
      findUnique: userFindUniqueMock,
      update: userUpdateMock,
    },
  };
}

describe("claimPlaceholderForUser", () => {
  beforeEach(() => {
    vi.resetModules();
    transactionMock.mockReset();
    messageCreateMock.mockReset();
    prismaUserFindUniqueMock.mockReset();
    prismaUserFindManyMock.mockReset();
    placeholderFindManyMock.mockReset();
    relationshipFindManyMock.mockReset();
    placeholderFindUniqueMock.mockReset();
    placeholderUpdateMock.mockReset();
    relationshipFindFirstMock.mockReset();
    relationshipCreateMock.mockReset();
    relationshipUpdateMock.mockReset();
    userFindUniqueMock.mockReset();
    userUpdateMock.mockReset();

    transactionMock.mockImplementation(async (callback) => callback(makeTransactionClient()));
    messageCreateMock.mockResolvedValue({});

    placeholderFindUniqueMock.mockResolvedValue({
      id: "placeholder_1",
      ownerId: "owner_1",
      relationshipType: "Friends",
      linkedUserId: null,
      note: null,
      owner: {
        id: "owner_1",
        name: "Owner",
      },
    });
    relationshipFindFirstMock.mockResolvedValue(null);
    relationshipCreateMock.mockResolvedValue({ id: "relationship_1" });
    placeholderUpdateMock.mockResolvedValue({ id: "placeholder_1" });
  });

  it("suppresses a successfully claimed placeholder for future candidate refreshes", async () => {
    userFindUniqueMock.mockResolvedValue({
      ignoredClaimPlaceholderIds: ["placeholder_old"],
    });

    const { claimPlaceholderForUser } = await import("./network-claims");

    await claimPlaceholderForUser("claimer_1", "placeholder_1");

    expect(placeholderUpdateMock).toHaveBeenCalledWith({
      where: { id: "placeholder_1" },
      data: {
        linkedUserId: "claimer_1",
        claimStatus: "claimed",
        inviteToken: null,
      },
      select: { id: true },
    });
    expect(userUpdateMock).toHaveBeenCalledWith({
      where: { id: "claimer_1" },
      data: {
        ignoredClaimPlaceholderIds: ["placeholder_old", "placeholder_1"],
      },
    });
  });
});

describe("getClaimCandidatesForUser", () => {
  beforeEach(() => {
    vi.resetModules();
    prismaUserFindUniqueMock.mockReset();
    prismaUserFindManyMock.mockReset();
    placeholderFindManyMock.mockReset();
    relationshipFindManyMock.mockReset();

    prismaUserFindUniqueMock.mockResolvedValue({
      id: "claimer_1",
      name: "Exact Match",
      email: null,
      phoneNumber: null,
      ignoredClaimPlaceholderIds: [],
    });
    prismaUserFindManyMock.mockResolvedValue([]);
  });

  it("keeps exact-name claim candidates even when a relationship row already exists", async () => {
    placeholderFindManyMock
      .mockResolvedValueOnce([
        {
          id: "placeholder_1",
          ownerId: "owner_1",
          name: "Exact Match",
          offerToNameMatch: true,
          email: null,
          phoneNumber: null,
          relationshipType: "Friends",
          note: null,
          inviteToken: null,
          claimStatus: "unclaimed",
          linkedUserId: null,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          owner: {
            id: "owner_1",
            name: "Owner",
            handle: "owner",
          },
        },
      ])
      .mockResolvedValueOnce([]);

    relationshipFindManyMock
      .mockResolvedValueOnce([
        {
          user1Id: "claimer_1",
          user2Id: "owner_1",
          type: "Friends",
          note: null,
        },
      ])
      .mockResolvedValueOnce([]);

    const { getClaimCandidatesForUser } = await import("./network-claims");

    const candidates = await getClaimCandidatesForUser("claimer_1");

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      placeholderId: "placeholder_1",
      name: "Exact Match",
      ownerId: "owner_1",
      matchReasons: ["Exact name match"],
    });
  });

  it("matches against alternate display names when the stored DB name is stale", async () => {
    prismaUserFindUniqueMock.mockResolvedValue({
      id: "claimer_1",
      name: "New member",
      email: null,
      phoneNumber: null,
      ignoredClaimPlaceholderIds: [],
    });
    placeholderFindManyMock
      .mockResolvedValueOnce([
        {
          id: "placeholder_1",
          ownerId: "owner_1",
          name: "Exact Match",
          offerToNameMatch: true,
          email: null,
          phoneNumber: null,
          relationshipType: "Friends",
          note: null,
          inviteToken: null,
          claimStatus: "unclaimed",
          linkedUserId: null,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          owner: {
            id: "owner_1",
            name: "Owner",
            handle: "owner",
          },
        },
      ])
      .mockResolvedValueOnce([]);
    relationshipFindManyMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const { getClaimCandidatesForUser } = await import("./network-claims");

    const candidates = await getClaimCandidatesForUser("claimer_1", {
      alternateNames: ["Exact Match"],
    });

    expect(candidates[0]).toMatchObject({
      placeholderId: "placeholder_1",
      matchReasons: ["Exact name match"],
    });
  });

  it("still suppresses weak name guesses when a relationship row already exists", async () => {
    placeholderFindManyMock
      .mockResolvedValueOnce([
        {
          id: "placeholder_1",
          ownerId: "owner_1",
          name: "Different Person",
          offerToNameMatch: true,
          email: null,
          phoneNumber: null,
          relationshipType: "Friends",
          note: null,
          inviteToken: null,
          claimStatus: "unclaimed",
          linkedUserId: null,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          owner: {
            id: "owner_1",
            name: "Owner",
            handle: "owner",
          },
        },
      ])
      .mockResolvedValueOnce([]);

    relationshipFindManyMock
      .mockResolvedValueOnce([
        {
          user1Id: "claimer_1",
          user2Id: "owner_1",
          type: "Friends",
          note: null,
        },
      ])
      .mockResolvedValueOnce([]);

    const { getClaimCandidatesForUser } = await import("./network-claims");

    await expect(getClaimCandidatesForUser("claimer_1")).resolves.toEqual([]);
  });
});
