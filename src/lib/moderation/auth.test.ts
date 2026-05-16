import { beforeEach, describe, expect, it, vi } from "vitest";

const currentUserMock = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({
  currentUser: currentUserMock,
}));

describe("moderation auth", () => {
  beforeEach(() => {
    vi.resetModules();
    currentUserMock.mockReset();
    delete process.env.MODERATOR_EMAILS;
  });

  it("allows the owner email even when MODERATOR_EMAILS is not set", async () => {
    const { isAllowedModeratorEmail } = await import("./auth");

    expect(isAllowedModeratorEmail(" SydneyWells103@gmail.com ")).toBe(true);
  });

  it("allows emails configured through MODERATOR_EMAILS", async () => {
    process.env.MODERATOR_EMAILS = "mod@example.com,other@example.com";
    const { isAllowedModeratorEmail } = await import("./auth");

    expect(isAllowedModeratorEmail("MOD@example.com")).toBe(true);
  });

  it("checks the current Clerk user's primary email", async () => {
    currentUserMock.mockResolvedValue({
      primaryEmailAddress: { emailAddress: "sydneywells103@gmail.com" },
      emailAddresses: [],
    });

    const { isCurrentUserModerator } = await import("./auth");

    await expect(isCurrentUserModerator()).resolves.toBe(true);
  });
});
