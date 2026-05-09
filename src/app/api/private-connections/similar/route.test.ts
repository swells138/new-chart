import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const currentUserMock = vi.fn();
const userFindUniqueMock = vi.fn();
const userFindManyMock = vi.fn();
const userCreateMock = vi.fn();
const placeholderFindManyMock = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
  currentUser: currentUserMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: userFindUniqueMock,
      findMany: userFindManyMock,
      create: userCreateMock,
    },
    placeholderPerson: {
      findMany: placeholderFindManyMock,
    },
  },
}));

describe("/api/private-connections/similar POST", () => {
  beforeEach(() => {
    vi.resetModules();
    authMock.mockReset();
    currentUserMock.mockReset();
    userFindUniqueMock.mockReset();
    userFindManyMock.mockReset();
    userCreateMock.mockReset();
    placeholderFindManyMock.mockReset();

    process.env.CLERK_SECRET_KEY = "test_secret";
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "test_publishable";

    authMock.mockResolvedValue({ userId: "clerk_123" });
    userFindUniqueMock.mockResolvedValue({ id: "owner_123" });
    userFindManyMock.mockResolvedValue([]);
  });

  it("only checks the current user's private chart results", async () => {
    placeholderFindManyMock.mockResolvedValue([
      {
        id: "owned_match",
        ownerId: "owner_123",
        name: "Jordan Lee",
        email: "jordan@example.com",
        phoneNumber: null,
        relationshipType: "Talking",
        note: "Met downtown",
        claimStatus: "unclaimed",
        createdAt: new Date("2026-05-01T00:00:00.000Z"),
        linkedUser: null,
      },
    ]);

    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/private-connections/similar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Jordan Lee",
          email: "JORDAN@example.com",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(placeholderFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ownerId: "owner_123" },
      }),
    );

    const body = (await response.json()) as {
      matches: Array<{ id: string; email: string; note: string }>;
    };
    expect(body.matches).toEqual([
      expect.objectContaining({
        id: "owned_match",
        email: "jordan@example.com",
        note: "Met downtown",
      }),
    ]);
  });

  it("suggests an existing public user when the name already exists", async () => {
    placeholderFindManyMock.mockResolvedValue([]);
    userFindManyMock.mockResolvedValue([
      {
        id: "user_existing",
        name: "Jordan Lee",
        handle: "jordan",
        email: null,
        phoneNumber: null,
      },
    ]);

    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/private-connections/similar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "jordan lee",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(userFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { not: "owner_123" },
        }),
      }),
    );

    const body = (await response.json()) as {
      suggestion: {
        kind: string;
        user: { id: string; name: string | null; handle: string | null };
        reason: string;
      } | null;
    };
    expect(body.suggestion).toEqual({
      kind: "existing-user",
      user: {
        id: "user_existing",
        name: "Jordan Lee",
        handle: "jordan",
      },
      reason: "name",
      message:
        "A Chart user already has this name. If this is them, you can connect with their public node instead.",
    });
  });
});
