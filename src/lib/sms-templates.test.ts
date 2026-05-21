import { describe, expect, it } from "vitest";
import {
  renderConnectionApprovalSms,
  renderInviteSms,
  renderVerificationSms,
} from "@/lib/sms-templates";

describe("sms templates", () => {
  it("renders the one-time invitation SMS with opt-out language", () => {
    expect(
      renderInviteSms({
        inviterName: "Avery",
        link: "https://meshylinks.com/invite/test",
      }),
    ).toBe(
      "Avery invited you to join MeshyLinks and connect on the platform. Create your account here: https://meshylinks.com/invite/test Reply HELP for help or STOP to opt out.",
    );
  });

  it("renders the connection request SMS with opt-out language", () => {
    expect(
      renderConnectionApprovalSms(
        "Avery",
        "https://meshylinks.com/connections/test",
      ),
    ).toBe(
      "Avery requested to connect with you on MeshyLinks. Review and approve here: https://meshylinks.com/connections/test Reply HELP for help or STOP to opt out.",
    );
  });

  it("renders the verification code SMS without marketing or opt-out copy", () => {
    expect(renderVerificationSms("123456")).toBe(
      "Your MeshyLinks verification code is 123456. This code expires in 10 minutes.",
    );
  });
});
