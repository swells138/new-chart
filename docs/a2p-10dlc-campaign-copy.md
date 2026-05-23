# MeshyLinks A2P 10DLC Campaign Copy

Use this copy for Twilio campaign registration so the submission matches the live website, opt-in CTA, privacy policy, terms, and sample messages.

## Campaign Description

MeshyLinks sends transactional SMS messages to account holders and manually invited recipients for account verification, login authentication, one-time invitations, connection approval requests, verified connection notices, and important service notifications. Recipients are users or known contacts who opted in through the MeshyLinks website flow or were manually invited by a MeshyLinks user who confirmed they had permission to contact the recipient. MeshyLinks does not send marketing, promotional, bulk, purchased-list, scraped-list, or auto-imported contact SMS.

## Message Flow / CTA

Users opt in on the MeshyLinks website at https://meshylinks.com when they provide a phone number for account verification, authentication, or service notifications and see this disclosure near the submission control: "By providing your phone number, you agree to receive transactional SMS messages from MeshyLinks related to account verification, invitations, login authentication, connection approvals, and important service notifications. Message frequency varies. Message and data rates may apply. Reply HELP for help or STOP to opt out. Consent is not a condition of purchase."

For invitations, a signed-in MeshyLinks user manually enters a known recipient's phone number in the private chart invite flow, checks a required consent box, and clicks Invite User. The checkbox says the recipient is a friend or known contact, gave permission to be contacted, and may receive a one-time transactional invitation SMS from MeshyLinks. The Invite User CTA also shows: "By clicking Invite User, you confirm that this recipient is a friend or known contact, that you have their permission to contact them, and that MeshyLinks may send them a one-time transactional invitation SMS. MeshyLinks does not send recurring marketing or promotional messages to invited users. Message frequency is one message per manual invitation. Message and data rates may apply. Reply HELP for help or STOP to opt out. Consent is not a condition of purchase."

The opt-in flow links to https://meshylinks.com/privacy and https://meshylinks.com/terms. The privacy policy states that mobile phone numbers and SMS opt-in information are not shared with third parties or affiliates for marketing or promotional purposes. It also states message frequency, message and data rates, and STOP opt-out handling.

## Sample Messages

1. MeshyLinks: [Inviter Name] invited you to join and connect on the platform. Create your account here: https://meshylinks.com/invite/[token] Reply HELP for help or STOP to opt out.

2. MeshyLinks: [User Name] requested to connect with you. Review and approve here: https://meshylinks.com/connections/[token] Reply HELP for help or STOP to opt out.

3. MeshyLinks: Your connection with [User Name] has been successfully verified and is now visible on your chart. Reply HELP for help or STOP to opt out.

4. MeshyLinks: A login attempt was made for your account. Your authentication code is [code]. If this was not you, please secure your account immediately. Reply HELP for help or STOP to opt out.

5. Your MeshyLinks verification code is [code]. This code expires in 10 minutes.

## Keyword Messages

Opt-in keywords: START, YES, UNSTOP

Opt-in reply: MeshyLinks: You are now opted in to receive transactional SMS messages related to account verification, invitations, login authentication, and important service notifications. Message frequency varies. Message and data rates may apply. Reply HELP for assistance or STOP to opt out.

Help reply: MeshyLinks support: For assistance, contact support@meshylinks.com. Reply STOP to unsubscribe from SMS messages. Message and data rates may apply.

Stop reply: MeshyLinks: You have successfully been unsubscribed. You will not receive any more messages from this number. Reply START to resubscribe.

## Registration Flags

Use case: ACCOUNT_NOTIFICATION or LOW_VOLUME, depending on brand type and Twilio availability. Do not register this as MARKETING.

Embedded links: Yes, because invite and connection approval messages contain MeshyLinks URLs.

Embedded phone numbers: No, unless future sample messages include a phone number.

Subscriber opt-in: Yes.

Age gated: No.

Direct lending: No.
