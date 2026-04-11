import { beforeEach, describe, expect, it, vi } from "vitest";

const headersGetMock = vi.fn();

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({
    get: headersGetMock,
  })),
}));

describe("/api/webhooks/clerk POST", () => {
  beforeEach(() => {
    vi.resetModules();
    headersGetMock.mockReset();
    delete process.env.CLERK_WEBHOOK_SECRET;
  });

  it("returns 503 when webhook secret is missing", async () => {
    const { POST } = await import("./route");

    const request = new Request("http://localhost/api/webhooks/clerk", {
      method: "POST",
      body: "{}",
    });

    const response = await POST(request);

    expect(response.status).toBe(503);
  });

  it("returns 400 when svix headers are missing", async () => {
    process.env.CLERK_WEBHOOK_SECRET = "whsec_test";

    headersGetMock.mockReturnValue(null);

    const { POST } = await import("./route");

    const request = new Request("http://localhost/api/webhooks/clerk", {
      method: "POST",
      body: "{}",
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
  });
});
