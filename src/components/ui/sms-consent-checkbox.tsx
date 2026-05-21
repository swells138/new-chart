"use client";

import Link from "next/link";

export const SMS_DISCLOSURE_TEXT =
  "By providing your phone number, you agree to receive transactional SMS messages from MeshyLinks related to account verification, invitations, login authentication, connection approvals, and important service notifications. Message frequency varies. Message and data rates may apply. Reply HELP for help or STOP to opt out.";

export const SMS_CONSENT_TEXT =
  "I confirm I have permission to contact this person and send them a one-time invitation.";

export const INVITE_ACTION_DISCLOSURE_TEXT =
  "By clicking “Invite User,” you confirm that this recipient is a friend or known contact, that you have their permission to contact them, and that MeshyLinks may send them a one-time transactional invitation SMS. MeshyLinks does not send recurring marketing or promotional messages to invited users. Message frequency is one message per manual invitation. Message and data rates may apply. Reply HELP for help or STOP to opt out.";

export const INVITE_CONSENT_HELPER_TEXT =
  "By sending an invite, you confirm that the recipient is a friend or known contact and that they gave you permission to contact them. SMS invitations are not sent to purchased, scraped, imported, or bulk contact lists.";

export function SmsConsentCheckbox(input: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  required?: boolean;
  label?: string;
  consentSourceLabel?: string;
}) {
  return (
    <div className="rounded-2xl border border-(--border-soft) bg-white/70 p-4 text-sm dark:bg-black/20">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={input.checked}
          onChange={(event) => input.onChange(event.target.checked)}
          className="mt-1 h-4 w-4"
          required={input.required}
        />
        <span className="leading-relaxed text-black/80 dark:text-white/85">
          {input.label ?? SMS_CONSENT_TEXT}{" "}
          <span className="block pt-2 text-xs text-black/65 dark:text-white/70">
            <Link
              href="https://meshylinks.com/privacy"
              className="font-semibold text-(--accent) underline"
              target="_blank"
              rel="noreferrer"
            >
              Privacy Policy
            </Link>{" "}
            ·{" "}
            <Link
              href="https://meshylinks.com/terms"
              className="font-semibold text-(--accent) underline"
              target="_blank"
              rel="noreferrer"
            >
              Terms &amp; Conditions
            </Link>
          </span>
        </span>
      </label>
      {input.consentSourceLabel ? (
        <p className="mt-2 text-[11px] text-black/55 dark:text-white/55">
          Consent source: {input.consentSourceLabel}
        </p>
      ) : null}
    </div>
  );
}
