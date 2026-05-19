// TEMP A2P REVIEW PAGE - SAFE TO DELETE AFTER APPROVAL

import type { Metadata } from "next";
import { SmsConsentReviewClient } from "./sms-consent-review-client";

export const metadata: Metadata = {
  title: "MeshyLinks SMS Consent Review",
  description:
    "Temporary public A2P review demo page showing MeshyLinks SMS invitation consent without sending real messages.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function SmsConsentReviewPage() {
  return <SmsConsentReviewClient />;
}
