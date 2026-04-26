import { beforeEach, describe, expect, it, vi } from "vitest";

const transactionMock = vi.fn();
const messageCreateMock = vi.fn();

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
