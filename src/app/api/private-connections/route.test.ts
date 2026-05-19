import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const currentUserMock = vi.fn();
const userFindUniqueMock = vi.fn();
const userCreateMock = vi.fn();
const placeholderFindUniqueMock = vi.fn();
const placeholderUpdateMock = vi.fn();
const queryRawMock = vi.fn();
const executeRawMock = vi.fn();
const getActiveUserLockMessageMock = vi.fn();
const checkRateLimitMock = vi.fn();
const sendNodeInviteEmailMock = vi.fn();
const recordSmsConsentMock = vi.fn();
const sendTransactionalSmsMock = vi.fn();

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
    $queryRaw: queryRawMock,
    $executeRaw: executeRawMock,
  },
}));

vi.mock("@/lib/moderation/locks", () => ({
  getActiveUserLockMessage: getActiveUserLockMessageMock,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: checkRateLimitMock,
  getRequestIp: () => "127.0.0.1",
}));

vi.mock("@/lib/email", () => ({
  sendInviteEmail: vi.fn(),
  sendNodeInviteEmail: sendNodeInviteEmailMock,
}));

vi.mock("@/lib/sms", () => ({
  normalizeSmsPhoneNumber: (value: string) => {
    const digits = value.replace(/\D/g, "");
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
    return value.startsWith("+") && digits ? `+${digits}` : "";
  },
  recordSmsConsent: recordSmsConsentMock,
  sendTransactionalSms: sendTransactionalSmsMock,
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
    queryRawMock.mockReset();
    executeRawMock.mockReset();
    getActiveUserLockMessageMock.mockReset();
    checkRateLimitMock.mockReset();
    sendNodeInviteEmailMock.mockReset();
    recordSmsConsentMock.mockReset();
    sendTransactionalSmsMock.mockReset();

    process.env.CLERK_SECRET_KEY = "test_secret";
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "test_publishable";

    authMock.mockResolvedValue({ userId: "clerk_123" });
    currentUserMock.mockResolvedValue(null);
    userFindUniqueMock.mockResolvedValue({ id: "owner_123" });
    getActiveUserLockMessageMock.mockResolvedValue(null);
    checkRateLimitMock.mockResolvedValue({ allowed: true });
    queryRawMock.mockResolvedValue([]);
    executeRawMock.mockResolvedValue(1);
    sendNodeInviteEmailMock.mockResolvedValue([{ statusCode: 202 }]);
    recordSmsConsentMock.mockResolvedValue(undefined);
    sendTransactionalSmsMock.mockResolvedValue({
      skipped: false,
      sid: "SM123",
    });
  });

  it("sends an invite token and marks an unclaimed placeholder invited", async () => {
    const createdAt = new Date("2026-05-01T00:00:00.000Z");
    placeholderFindUniqueMock.mockResolvedValue({
      id: "placeholder_123",
      ownerId: "owner_123",
      name: "Jordan Lee",
      email: "jordan@example.com",
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
      email: "jordan@example.com",
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
          inviteConsent: true,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(sendNodeInviteEmailMock).toHaveBeenCalledWith({
      to: "jordan@example.com",
      token: expect.stringMatching(/^[a-f0-9]{48}$/),
      inviterName: "Someone",
    });
    expect(executeRawMock).toHaveBeenCalled();
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

  it("requires sender permission confirmation before sending an invitation", async () => {
    placeholderFindUniqueMock.mockResolvedValue({
      id: "placeholder_123",
      ownerId: "owner_123",
      name: "Jordan Lee",
      email: "jordan@example.com",
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

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error:
        "Confirm that you have permission to contact this person and send them a one-time invitation.",
    });
    expect(sendNodeInviteEmailMock).not.toHaveBeenCalled();
    expect(placeholderUpdateMock).not.toHaveBeenCalled();
  });

  it("rotates an existing invite token when resending after the duplicate window", async () => {
    const createdAt = new Date("2026-05-01T00:00:00.000Z");
    placeholderFindUniqueMock.mockResolvedValue({
      id: "placeholder_123",
      ownerId: "owner_123",
      name: "Jordan Lee",
      email: "jordan@example.com",
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
      email: "jordan@example.com",
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
          inviteConsent: true,
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
  });

  it("creates a copyable invite link without contact information", async () => {
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
    placeholderUpdateMock.mockResolvedValue({
      id: "placeholder_123",
      ownerId: "owner_123",
      name: "Jordan Lee",
      email: null,
      phoneNumber: null,
      relationshipType: "Talking",
      note: null,
      inviteToken: "generated-token",
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
          inviteConsent: true,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(sendNodeInviteEmailMock).not.toHaveBeenCalled();
    expect(placeholderUpdateMock).toHaveBeenCalledWith({
      where: { id: "placeholder_123" },
      data: {
        inviteToken: expect.stringMatching(/^[a-f0-9]{48}$/),
        claimStatus: "invited",
      },
    });

    const body = (await response.json()) as {
      message?: string;
      placeholder: { inviteToken: string; claimStatus: string };
    };
    expect(body.message).toBe("Invite link ready.");
    expect(body.placeholder.inviteToken).toBe("generated-token");
    expect(body.placeholder.claimStatus).toBe("invited");
  });

  it("prevents duplicate invite sends too often", async () => {
    placeholderFindUniqueMock.mockResolvedValue({
      id: "placeholder_123",
      ownerId: "owner_123",
      name: "Jordan Lee",
      email: "jordan@example.com",
      phoneNumber: null,
      relationshipType: "Talking",
      note: null,
      inviteToken: "existing-token",
      linkedUserId: null,
      claimStatus: "invited",
      createdAt: new Date("2026-05-01T00:00:00.000Z"),
      offerToNameMatch: true,
    });
    queryRawMock.mockResolvedValue([
      { status: "pending", contactMethod: "email", sentAt: new Date() },
    ]);

    const { PATCH } = await import("./route");

    const response = await PATCH(
      new Request("http://localhost/api/private-connections", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: "placeholder_123",
          action: "generateInvite",
          inviteConsent: true,
        }),
      }),
    );

    expect(response.status).toBe(429);
    expect(sendNodeInviteEmailMock).not.toHaveBeenCalled();
    expect(placeholderUpdateMock).not.toHaveBeenCalled();
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

  it("sends an SMS invite when the placeholder has a phone number", async () => {
    const createdAt = new Date("2026-05-01T00:00:00.000Z");
    placeholderFindUniqueMock.mockResolvedValue({
      id: "placeholder_123",
      ownerId: "owner_123",
      name: "Jordan Lee",
      email: null,
      phoneNumber: "+15555550123",
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
      phoneNumber: "+15555550123",
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
          inviteConsent: true,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(sendNodeInviteEmailMock).not.toHaveBeenCalled();
    expect(recordSmsConsentMock).toHaveBeenCalledWith({
      phoneNumber: "+15555550123",
      consented: true,
      source: "invite",
      userId: "owner_123",
    });
    expect(sendTransactionalSmsMock).toHaveBeenCalledWith({
      to: "+15555550123",
      body: expect.stringContaining(
        "Someone invited you to join MeshyLinks and connect on the platform.",
      ),
      type: "invite",
      userId: "owner_123",
      inviteToken: expect.stringMatching(/^[a-f0-9]{48}$/),
    });
    expect(executeRawMock).toHaveBeenCalled();

    const body = (await response.json()) as {
      message?: string;
      placeholder: { inviteToken: string; claimStatus: string };
    };
    expect(body.message).toBe("Invite sent.");
    expect(body.placeholder.inviteToken).toMatch(/^[a-f0-9]{48}$/);
    expect(body.placeholder.claimStatus).toBe("invited");
  });
});
