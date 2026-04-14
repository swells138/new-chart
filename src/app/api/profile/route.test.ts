import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const currentUserMock = vi.fn();

const findUniqueMock = vi.fn();
const findFirstMock = vi.fn();
const createMock = vi.fn();
const updateMock = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
  currentUser: currentUserMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: findUniqueMock,
      findFirst: findFirstMock,
      create: createMock,
      update: updateMock,
    },
  },
}));

describe("/api/profile PATCH", () => {
  beforeEach(() => {
    vi.resetModules();
    authMock.mockReset();
    currentUserMock.mockReset();
    findUniqueMock.mockReset();
    findFirstMock.mockReset();
    createMock.mockReset();
    updateMock.mockReset();

    process.env.CLERK_SECRET_KEY = "test_secret";
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "test_publishable";

    authMock.mockResolvedValue({ userId: "clerk_123" });
    findUniqueMock.mockResolvedValue({
      id: "db_123",
      clerkId: "clerk_123",
      name: "Existing User",
      handle: "existing",
      pronouns: null,
      bio: null,
      location: null,
      relationshipStatus: null,
      interests: [],
      links: {},
      profileImage: null,
      email: "existing@example.com",
    });
    findFirstMock.mockResolvedValue(null);
  });

  it("returns 400 for invalid JSON", async () => {
    const { PATCH } = await import("./route");

    const request = new Request("http://localhost/api/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: "not-json",
    });

    const response = await PATCH(request);

    expect(response.status).toBe(400);
  });

  it("returns 400 when unknown fields are sent", async () => {
    const { PATCH } = await import("./route");

    const request = new Request("http://localhost/api/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "A", unknownField: "bad" }),
    });

    const response = await PATCH(request);

    expect(response.status).toBe(400);
  });

  it("updates profile for valid payload", async () => {
    updateMock.mockResolvedValue({
      id: "db_123",
      clerkId: "clerk_123",
      name: "Updated Name",
      handle: "existing",
      pronouns: "They/Them",
      bio: "Bio",
      location: "Seattle, WA",
      relationshipStatus: "single",
      interests: ["music"],
      links: { website: "https://example.com" },
      profileImage: null,
      email: "existing@example.com",
    });

    const { PATCH } = await import("./route");

    const request = new Request("http://localhost/api/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Updated Name",
        pronouns: "They/Them",
        location: "Seattle, WA",
        bio: "Bio",
        interests: ["music"],
      }),
    });

    const response = await PATCH(request);

    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledOnce();
  });

  it("allows setting a username when it does not exist yet", async () => {
    findUniqueMock.mockResolvedValueOnce(null);
    createMock.mockResolvedValueOnce({
      id: "db_123",
      clerkId: "clerk_123",
      name: "Existing User",
      handle: null,
      pronouns: null,
      bio: null,
      location: null,
      relationshipStatus: null,
      interests: [],
      links: {},
      profileImage: null,
      email: "existing@example.com",
    });

    updateMock.mockResolvedValue({
      id: "db_123",
      clerkId: "clerk_123",
      name: "Existing User",
      handle: "new.user",
      pronouns: null,
      bio: null,
      location: "Ohio",
      relationshipStatus: null,
      interests: ["music production", "camping"],
      links: {},
      profileImage: null,
      email: "existing@example.com",
    });

    const { PATCH } = await import("./route");

    const request = new Request("http://localhost/api/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        handle: "new.user",
        location: "Ohio",
        interests: ["music production", "camping"],
      }),
    });

    const response = await PATCH(request);

    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          handle: "new.user",
          location: "Ohio",
        }),
      })
    );
  });

  it("rejects username change when one already exists", async () => {
    const { PATCH } = await import("./route");

    const request = new Request("http://localhost/api/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ handle: "another_name" }),
    });

    const response = await PATCH(request);

    expect(response.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
