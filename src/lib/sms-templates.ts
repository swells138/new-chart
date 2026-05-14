export type TransactionalSmsType =
  | "invite"
  | "verification"
  | "connection_approval"
  | "connection_verified"
  | "login_auth";

export const SMS_OPT_IN_KEYWORDS = new Set(["START", "YES", "UNSTOP"]);

export const SMS_OPT_IN_CONFIRMATION_MESSAGE =
  "MeshyLinks: You are now opted in to receive transactional SMS messages related to account verification, invitations, connection approvals, and service notifications. Message frequency varies. Message and data rates may apply. Reply HELP for assistance or STOP to opt out.";

export const SMS_HELP_MESSAGE =
  "MeshyLinks: For help, visit https://meshylinks.com/support or contact support through your account. Reply STOP to opt out.";

export const SMS_STOP_CONFIRMATION_MESSAGE =
  "MeshyLinks: You have been opted out and will no longer receive SMS messages from MeshyLinks. Reply START to opt back in.";

export function renderInviteSms(inviteCode: string) {
  return `MeshyLinks: Someone invited you to claim your node on MeshyLinks. Create your account here: https://meshylinks.com/signup?invite=${encodeURIComponent(inviteCode)} Reply STOP to opt out.`;
}

export function renderVerificationSms(code: string) {
  return `MeshyLinks: Your verification code is ${code}. This code will expire in 10 minutes. Reply STOP to opt out.`;
}

export function renderConnectionApprovalSms(userName: string) {
  return `MeshyLinks: ${userName} requested to connect with you on MeshyLinks. Review and approve here: https://meshylinks.com/connections Reply STOP to opt out.`;
}

export function renderConnectionVerifiedSms(userName: string) {
  return `MeshyLinks: Your connection with ${userName} has been successfully verified and is now visible on your chart. Reply STOP to opt out.`;
}

export function renderLoginAuthSms(code: string) {
  return `MeshyLinks: A login attempt was made for your account. Your authentication code is ${code}. If this was not you, please secure your account immediately. Reply STOP to opt out.`;
}
