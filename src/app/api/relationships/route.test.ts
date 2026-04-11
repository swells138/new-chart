import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const currentUserMock = vi.fn();

const userFindUniqueMock = vi.fn();
const userCreateMock = vi.fn();
const userFindManyMock = vi.fn();
const relationshipFindFirstMock = vi.fn();
const relationshipCreateMock = vi.fn();
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
      create: relationshipCreateMock,
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
    relationshipCreateMock.mockReset();
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
        type: "friends",
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
        type: "friends",
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(403);
  });
});
