import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const currentUserMock = vi.fn();
const userFindUniqueMock = vi.fn();
const userCreateMock = vi.fn();
const placeholderFindUniqueMock = vi.fn();
const placeholderUpdateMock = vi.fn();
const getActiveUserLockMessageMock = vi.fn();
const checkRateLimitMock = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
  currentUser: currentUserMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: userFindUniqueMock,
      create: userCreateMock,
    },
    placeholderPerson: {
      findUnique: placeholderFindUniqueMock,
      update: placeholderUpdateMock,
    },
  },
}));

vi.mock("@/lib/moderation/locks", () => ({
  getActiveUserLockMessage: getActiveUserLockMessageMock,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: checkRateLimitMock,
  getRequestIp: () => "127.0.0.1",
}));

describe("/api/private-connections PATCH invite actions", () => {
  beforeEach(() => {
    vi.resetModules();
    authMock.mockReset();
    currentUserMock.mockReset();
    userFindUniqueMock.mockReset();
    userCreateMock.mockReset();
    placeholderFindUniqueMock.mockReset();
    placeholderUpdateMock.mockReset();
    getActiveUserLockMessageMock.mockReset();
    checkRateLimitMock.mockReset();

    process.env.CLERK_SECRET_KEY = "test_secret";
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "test_publishable";

    authMock.mockResolvedValue({ userId: "clerk_123" });
    currentUserMock.mockResolvedValue(null);
    userFindUniqueMock.mockResolvedValue({ id: "owner_123" });
    getActiveUserLockMessageMock.mockResolvedValue(null);
    checkRateLimitMock.mockResolvedValue({ allowed: true });
  });

  it("generates an invite token and marks an unclaimed placeholder invited", async () => {
    const createdAt = new Date("2026-05-01T00:00:00.000Z");
    placeholderFindUniqueMock.mockResolvedValue({
      id: "placeholder_123",
      ownerId: "owner_123",
      name: "Jordan Lee",
      email: null,
      phoneNumber: null,
      relationshipType: "Talking",
      note: null,
      inviteToken: null,
      linkedUserId: null,
      claimStatus: "unclaimed",
      createdAt,
      offerToNameMatch: true,
    });
    placeholderUpdateMock.mockImplementation(async ({ data }) => ({
      id: "placeholder_123",
      ownerId: "owner_123",
      name: "Jordan Lee",
      email: null,
      phoneNumber: null,
      relationshipType: "Talking",
      note: null,
      inviteToken: data.inviteToken,
      linkedUserId: null,
      claimStatus: data.claimStatus,
      createdAt,
      offerToNameMatch: true,
    }));

    const { PATCH } = await import("./route");

    const response = await PATCH(
      new Request("http://localhost/api/private-connections", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: "placeholder_123",
          action: "generateInvite",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(placeholderUpdateMock).toHaveBeenCalledWith({
      where: { id: "placeholder_123" },
      data: {
        inviteToken: expect.stringMatching(/^[a-f0-9]{48}$/),
        claimStatus: "invited",
      },
    });

    const body = (await response.json()) as {
      placeholder: { inviteToken: string; claimStatus: string };
    };
    expect(body.placeholder.inviteToken).toMatch(/^[a-f0-9]{48}$/);
    expect(body.placeholder.claimStatus).toBe("invited");
  });

  it("reuses an existing invite token", async () => {
    const createdAt = new Date("2026-05-01T00:00:00.000Z");
    placeholderFindUniqueMock.mockResolvedValue({
      id: "placeholder_123",
      ownerId: "owner_123",
      name: "Jordan Lee",
      email: null,
      phoneNumber: null,
      relationshipType: "Talking",
      note: null,
      inviteToken: "existing-token",
      linkedUserId: null,
      claimStatus: "invited",
      createdAt,
      offerToNameMatch: true,
    });
    placeholderUpdateMock.mockResolvedValue({
      id: "placeholder_123",
      ownerId: "owner_123",
      name: "Jordan Lee",
      email: null,
      phoneNumber: null,
      relationshipType: "Talking",
      note: null,
      inviteToken: "existing-token",
      linkedUserId: null,
      claimStatus: "invited",
      createdAt,
      offerToNameMatch: true,
    });

    const { PATCH } = await import("./route");

    const response = await PATCH(
      new Request("http://localhost/api/private-connections", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: "placeholder_123",
          action: "generateInvite",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(placeholderUpdateMock).toHaveBeenCalledWith({
      where: { id: "placeholder_123" },
      data: {
        inviteToken: "existing-token",
        claimStatus: "invited",
      },
    });
  });

  it("does not generate an invite for another user's placeholder", async () => {
    placeholderFindUniqueMock.mockResolvedValue({
      id: "placeholder_123",
      ownerId: "other_owner",
      name: "Jordan Lee",
      email: null,
      phoneNumber: null,
      relationshipType: "Talking",
      note: null,
      inviteToken: null,
      linkedUserId: null,
      claimStatus: "unclaimed",
      createdAt: new Date("2026-05-01T00:00:00.000Z"),
      offerToNameMatch: true,
    });

    const { PATCH } = await import("./route");

    const response = await PATCH(
      new Request("http://localhost/api/private-connections", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: "placeholder_123",
          action: "generateInvite",
        }),
      }),
    );

    expect(response.status).toBe(403);
    expect(placeholderUpdateMock).not.toHaveBeenCalled();
  });
});
