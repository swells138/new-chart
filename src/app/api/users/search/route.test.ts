import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const currentUserMock = vi.fn();
const userFindUniqueMock = vi.fn();
const userFindManyMock = vi.fn();
const userUpdateManyMock = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
  currentUser: currentUserMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: userFindUniqueMock,
      findMany: userFindManyMock,
      updateMany: userUpdateManyMock,
    },
  },
}));

describe("/api/users/search GET", () => {
  beforeEach(() => {
    vi.resetModules();
    authMock.mockReset();
    currentUserMock.mockReset();
    userFindUniqueMock.mockReset();
    userFindManyMock.mockReset();
    userUpdateManyMock.mockReset();

    process.env.CLERK_SECRET_KEY = "test_secret";
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "test_publishable";

    authMock.mockResolvedValue({ userId: "clerk_123" });
    userFindUniqueMock.mockResolvedValue({
      id: "user_123",
      email: "member@example.com",
      isPro: false,
      freeSearchesUsed: 0,
    });
    userUpdateManyMock.mockResolvedValue({ count: 1 });
    userFindManyMock.mockResolvedValue([]);
  });

  it("increments free search usage for non-pro users", async () => {
    const { GET } = await import("./route");

    const response = await GET(
      new Request("http://localhost/api/users/search?q=avery"),
    );

    expect(response.status).toBe(200);
    expect(userUpdateManyMock).toHaveBeenCalledWith({
      where: {
        id: "user_123",
        freeSearchesUsed: { lt: 5 },
      },
      data: {
        freeSearchesUsed: { increment: 1 },
      },
    });

    const body = (await response.json()) as {
      searchesUsed: number;
      searchLimit: number;
    };
    expect(body.searchesUsed).toBe(1);
    expect(body.searchLimit).toBe(5);
  });

  it("prompts non-pro users to upgrade after 5 searches", async () => {
    userFindUniqueMock.mockResolvedValue({
      id: "user_123",
      email: "member@example.com",
      isPro: false,
      freeSearchesUsed: 5,
    });

    const { GET } = await import("./route");

    const response = await GET(
      new Request("http://localhost/api/users/search?q=avery"),
    );

    expect(response.status).toBe(402);
    expect(userUpdateManyMock).not.toHaveBeenCalled();
    expect(userFindManyMock).not.toHaveBeenCalled();

    const body = (await response.json()) as {
      upgradeRequired: boolean;
      searchesUsed: number;
      searchLimit: number;
    };
    expect(body.upgradeRequired).toBe(true);
    expect(body.searchesUsed).toBe(5);
    expect(body.searchLimit).toBe(5);
  });

  it("does not increment usage for pro users", async () => {
    userFindUniqueMock.mockResolvedValue({
      id: "user_123",
      email: "member@example.com",
      isPro: true,
      freeSearchesUsed: 5,
    });

    const { GET } = await import("./route");

    const response = await GET(
      new Request("http://localhost/api/users/search?q=avery"),
    );

    expect(response.status).toBe(200);
    expect(userUpdateManyMock).not.toHaveBeenCalled();
    expect(userFindManyMock).toHaveBeenCalledOnce();
  });
});
