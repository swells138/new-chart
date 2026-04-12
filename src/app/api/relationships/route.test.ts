import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const currentUserMock = vi.fn();

const userFindUniqueMock = vi.fn();
const userCreateMock = vi.fn();
const userFindManyMock = vi.fn();
const relationshipFindFirstMock = vi.fn();
const relationshipFindUniqueMock = vi.fn();
const relationshipCreateMock = vi.fn();
const relationshipUpdateMock = vi.fn();
const relationshipDeleteMock = vi.fn();
const messageCreateMock = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
  currentUser: currentUserMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: userFindUniqueMock,
      create: userCreateMock,
      findMany: userFindManyMock,
    },
    relationship: {
      findFirst: relationshipFindFirstMock,
      findUnique: relationshipFindUniqueMock,
      create: relationshipCreateMock,
      update: relationshipUpdateMock,
      delete: relationshipDeleteMock,
    },
    message: {
      create: messageCreateMock,
    },
  },
}));

describe("/api/relationships POST", () => {
  beforeEach(() => {
    vi.resetModules();
    authMock.mockReset();
    currentUserMock.mockReset();
    userFindUniqueMock.mockReset();
    userCreateMock.mockReset();
    userFindManyMock.mockReset();
    relationshipFindFirstMock.mockReset();
    relationshipFindUniqueMock.mockReset();
    relationshipCreateMock.mockReset();
    relationshipUpdateMock.mockReset();
    relationshipDeleteMock.mockReset();
    messageCreateMock.mockReset();

    process.env.CLERK_SECRET_KEY = "test_secret";
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "test_publishable";

    authMock.mockResolvedValue({ userId: "clerk_1" });
    userFindUniqueMock.mockResolvedValue({ id: "db_1" });
  });

  it("returns 400 for strict-schema violations", async () => {
    const { POST } = await import("./route");

    const request = new Request("http://localhost/api/relationships", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source: "db_1",
        target: "db_2",
        type: "Friends",
        extra: "not-allowed",
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it("returns 403 when source is not current user", async () => {
    const { POST } = await import("./route");

    const request = new Request("http://localhost/api/relationships", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source: "db_999",
        target: "db_2",
        type: "Friends",
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(403);
  });
});

describe("/api/relationships PATCH", () => {
  beforeEach(() => {
    vi.resetModules();
    authMock.mockReset();
    currentUserMock.mockReset();
    userFindUniqueMock.mockReset();
    userCreateMock.mockReset();
    userFindManyMock.mockReset();
    relationshipFindFirstMock.mockReset();
    relationshipFindUniqueMock.mockReset();
    relationshipCreateMock.mockReset();
    relationshipUpdateMock.mockReset();
    relationshipDeleteMock.mockReset();
    messageCreateMock.mockReset();

    process.env.CLERK_SECRET_KEY = "test_secret";
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "test_publishable";

    authMock.mockResolvedValue({ userId: "clerk_1" });
    userFindUniqueMock.mockResolvedValue({ id: "db_1" });
  });

  it("creates a pending approval request when changing an approved connection type", async () => {
    const { PATCH } = await import("./route");

    relationshipFindUniqueMock.mockResolvedValue({
      id: "rel_1",
      user1Id: "db_1",
      user2Id: "db_2",
      type: "Friends",
    });

    relationshipUpdateMock.mockResolvedValue({
      id: "rel_1",
      user1Id: "db_1",
      user2Id: "db_2",
      type: "pending::Married::db_1::db_2",
    });

    const request = new Request("http://localhost/api/relationships", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "rel_1",
        type: "Married",
        actorNodeId: "db_1",
      }),
    });

    const response = await PATCH(request);
    const body = (await response.json()) as {
      relationship?: {
        id: string;
        type: string;
        note: string;
      };
    };

    expect(response.status).toBe(200);
    expect(relationshipUpdateMock).toHaveBeenCalledWith({
      where: { id: "rel_1" },
      data: { type: "pending::Married::db_1::db_2" },
    });
    expect(body.relationship?.id).toBe("rel_1");
    expect(body.relationship?.type).toBe("Married");
    expect(body.relationship?.note).toContain("\"status\":\"pending\"");
  });
});
