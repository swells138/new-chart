import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const currentUserMock = vi.fn();
const clerkClientMock = vi.fn();
const clerkGetUserMock = vi.fn();

const userFindUniqueMock = vi.fn();
const userCreateMock = vi.fn();
const userFindManyMock = vi.fn();
const relationshipFindFirstMock = vi.fn();
const relationshipFindUniqueMock = vi.fn();
const relationshipCreateMock = vi.fn();
const relationshipUpdateMock = vi.fn();
const relationshipDeleteMock = vi.fn();
const messageCreateMock = vi.fn();
const sendUserNotificationEmailMock = vi.fn();
const recalculateConnectionScoresForUsersMock = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
  currentUser: currentUserMock,
  clerkClient: clerkClientMock,
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
    $executeRaw: vi.fn().mockResolvedValue(undefined),
    $queryRaw: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@/lib/email", () => ({
  sendUserNotificationEmail: sendUserNotificationEmailMock,
}));

vi.mock("@/lib/connection-score", () => ({
  recalculateConnectionScoresForUsers: recalculateConnectionScoresForUsersMock,
}));

describe("/api/relationships POST", () => {
  beforeEach(() => {
    vi.resetModules();
    authMock.mockReset();
    currentUserMock.mockReset();
    clerkClientMock.mockReset();
    clerkGetUserMock.mockReset();
    userFindUniqueMock.mockReset();
    userCreateMock.mockReset();
    userFindManyMock.mockReset();
    relationshipFindFirstMock.mockReset();
    relationshipFindUniqueMock.mockReset();
    relationshipCreateMock.mockReset();
    relationshipUpdateMock.mockReset();
    relationshipDeleteMock.mockReset();
    messageCreateMock.mockReset();
    sendUserNotificationEmailMock.mockReset();
    recalculateConnectionScoresForUsersMock.mockReset();

    process.env.CLERK_SECRET_KEY = "test_secret";
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "test_publishable";
    process.env.NEXT_PUBLIC_SITE_URL = "https://chart.example";

    authMock.mockResolvedValue({ userId: "clerk_1" });
    clerkClientMock.mockResolvedValue({
      users: {
        getUser: clerkGetUserMock,
      },
    });
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
        type: "Talking",
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
        type: "Talking",
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(403);
  });

  it("emails the target user when creating a public connection request", async () => {
    const { POST } = await import("./route");

    userFindManyMock.mockResolvedValue([
      {
        id: "db_1",
        clerkId: "clerk_1",
        name: "Sydney Wells",
        handle: "sydney",
        email: "sydney@example.com",
      },
      {
        id: "db_2",
        clerkId: "clerk_2",
        name: "Jordan Lee",
        handle: "jordan",
        email: "jordan@example.com",
      },
    ]);
    relationshipFindFirstMock.mockResolvedValue(null);
    relationshipCreateMock.mockResolvedValue({
      id: "rel_1",
      user1Id: "db_1",
      user2Id: "db_2",
      type: "pending::Talking::db_1::db_2",
      note: "{\"status\":\"pending_claim\"}",
      isPublic: false,
      publicRequestedBy: null,
    });
    messageCreateMock.mockResolvedValue({ id: "msg_1" });

    const request = new Request("http://localhost/api/relationships", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source: "db_1",
        target: "db_2",
        type: "Talking",
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(messageCreateMock).toHaveBeenCalledWith({
      data: {
        senderId: "db_1",
        recipientId: "db_2",
        content:
          "You have a new connection request (Talking). Review it on /map?chart=public&focus=approvals#pending-verification.",
      },
    });
    expect(sendUserNotificationEmailMock).toHaveBeenCalledWith({
      to: "jordan@example.com",
      subject: "Sydney Wells sent you a Chart connection request",
      text: [
        "Sydney Wells sent you a Talking connection request on Chart.",
        "",
        "Review it here: https://chart.example/inbox?notificationId=msg_1#notification-msg_1",
      ].join("\n"),
    });
  });

  it("falls back to Clerk primary email when the target DB email is missing", async () => {
    const { POST } = await import("./route");

    userFindManyMock.mockResolvedValue([
      {
        id: "db_1",
        clerkId: "clerk_1",
        name: "Sydney Wells",
        handle: "sydney",
        email: "sydney@example.com",
      },
      {
        id: "db_2",
        clerkId: "clerk_2",
        name: "Jordan Lee",
        handle: "jordan",
        email: "db2.seed@placeholder.meshylinks.local",
      },
    ]);
    clerkGetUserMock.mockResolvedValue({
      primaryEmailAddress: {
        emailAddress: "real-jordan@example.com",
      },
      emailAddresses: [],
    });
    relationshipFindFirstMock.mockResolvedValue(null);
    relationshipCreateMock.mockResolvedValue({
      id: "rel_1",
      user1Id: "db_1",
      user2Id: "db_2",
      type: "pending::Talking::db_1::db_2",
      note: "{\"status\":\"pending_claim\"}",
      isPublic: false,
      publicRequestedBy: null,
    });

    const request = new Request("http://localhost/api/relationships", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source: "db_1",
        target: "db_2",
        type: "Talking",
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(clerkGetUserMock).toHaveBeenCalledWith("clerk_2");
    expect(sendUserNotificationEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "real-jordan@example.com",
      }),
    );
  });
});

describe("/api/relationships PATCH", () => {
  beforeEach(() => {
    vi.resetModules();
    authMock.mockReset();
    currentUserMock.mockReset();
    clerkClientMock.mockReset();
    clerkGetUserMock.mockReset();
    userFindUniqueMock.mockReset();
    userCreateMock.mockReset();
    userFindManyMock.mockReset();
    relationshipFindFirstMock.mockReset();
    relationshipFindUniqueMock.mockReset();
    relationshipCreateMock.mockReset();
    relationshipUpdateMock.mockReset();
    relationshipDeleteMock.mockReset();
    messageCreateMock.mockReset();
    sendUserNotificationEmailMock.mockReset();
    recalculateConnectionScoresForUsersMock.mockReset();

    process.env.CLERK_SECRET_KEY = "test_secret";
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "test_publishable";

    authMock.mockResolvedValue({ userId: "clerk_1" });
    clerkClientMock.mockResolvedValue({
      users: {
        getUser: clerkGetUserMock,
      },
    });
    userFindUniqueMock.mockResolvedValue({ id: "db_1" });
  });

  it("creates a pending approval request when changing an approved connection type", async () => {
    const { PATCH } = await import("./route");

    relationshipFindUniqueMock.mockResolvedValue({
      id: "rel_1",
      user1Id: "db_1",
      user2Id: "db_2",
      type: "Talking",
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
    expect(body.relationship?.note).toContain("\"status\":\"pending_claim\"");
  });
});
