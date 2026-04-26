import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  getModerationReportById,
  listModerationReports,
  lockUserUntil,
  type ModerationAction,
  updateModerationReportStatus,
} from "@/lib/moderation/reports";
import { getCurrentUserPrimaryEmail, isCurrentUserModerator } from "@/lib/moderation/auth";

const patchSchema = z
  .object({
    id: z.string().trim().min(1).max(120),
    status: z.enum(["open", "resolved", "dismissed"]),
    decisionNote: z.string().trim().max(600).optional(),
    action: z
      .enum([
        "none",
        "remove-public-connections",
        "hide-private-node",
        "lock-target-24h",
        "lock-target-72h",
        "lock-target-7d",
      ])
      .optional(),
  })
  .strict();

function getLockHours(action: ModerationAction) {
  if (action === "lock-target-24h") return 24;
  if (action === "lock-target-72h") return 72;
  if (action === "lock-target-7d") return 24 * 7;
  return 0;
}

async function resolveTargetUserId(report: {
  kind: "public-node" | "private-node" | "report-remove-request";
  targetId: string;
}) {
  if (report.kind === "report-remove-request") {
    return null;
  }

  if (report.kind === "public-node") {
    return report.targetId;
  }

  const placeholder = await prisma.placeholderPerson.findUnique({
    where: { id: report.targetId },
    select: { ownerId: true, linkedUserId: true },
  });

  if (!placeholder) {
    return null;
  }

  return placeholder.linkedUserId ?? placeholder.ownerId;
}

async function runModerationAction(input: {
  action: ModerationAction;
  report: {
    kind: "public-node" | "private-node" | "report-remove-request";
    targetId: string;
  };
  decisionNote?: string;
  moderatorIdentity?: string | null;
}) {
  if (input.action === "none") {
    return;
  }

  if (input.report.kind === "report-remove-request") {
    throw new Error("No automated action is available for report/remove requests.");
  }

  if (input.action === "remove-public-connections") {
    if (input.report.kind !== "public-node") {
      throw new Error("remove-public-connections only applies to public-node reports.");
    }

    await prisma.relationship.deleteMany({
      where: {
        OR: [{ user1Id: input.report.targetId }, { user2Id: input.report.targetId }],
      },
    });
    return;
  }

  if (input.action === "hide-private-node") {
    if (input.report.kind !== "private-node") {
      throw new Error("hide-private-node only applies to private-node reports.");
    }

    await prisma.placeholderPerson.updateMany({
      where: { id: input.report.targetId },
      data: {
        claimStatus: "denied",
        inviteToken: null,
      },
    });
    return;
  }

  const lockHours = getLockHours(input.action);
  if (lockHours > 0) {
    const targetUserId = await resolveTargetUserId(input.report);
    if (!targetUserId) {
      throw new Error("Could not identify a user to lock for this report.");
    }

    const until = new Date(Date.now() + lockHours * 60 * 60 * 1000);
    await lockUserUntil({
      userId: targetUserId,
      lockedBy: input.moderatorIdentity ?? null,
      reason: input.decisionNote ?? `Locked via moderation report action: ${input.action}`,
      until,
    });
  }
}

async function assertModerator() {
  const allowed = await isCurrentUserModerator();
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function GET() {
  const denied = await assertModerator();
  if (denied) {
    return denied;
  }

  try {
    const reports = await listModerationReports(300);
    return NextResponse.json({ reports });
  } catch (error) {
    console.error("Failed to load moderation reports", error);
    return NextResponse.json(
      { error: "Could not load moderation queue." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const denied = await assertModerator();
  if (denied) {
    return denied;
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  try {
    const existing = await getModerationReportById(parsed.data.id);
    if (!existing) {
      return NextResponse.json({ error: "Report not found." }, { status: 404 });
    }

    const action = parsed.data.action ?? "none";
    if (parsed.data.status === "resolved") {
      const moderatorIdentity = await getCurrentUserPrimaryEmail();
      await runModerationAction({
        action,
        report: existing,
        decisionNote: parsed.data.decisionNote,
        moderatorIdentity,
      });
    }

    const updated = await updateModerationReportStatus({
      id: parsed.data.id,
      status: parsed.data.status,
      decisionNote:
        parsed.data.action && parsed.data.action !== "none"
          ? `${parsed.data.decisionNote?.trim() || ""}\nAction: ${parsed.data.action}`.trim()
          : parsed.data.decisionNote,
    });
    if (!updated) {
      return NextResponse.json({ error: "Report not found." }, { status: 404 });
    }

    return NextResponse.json({ report: updated });
  } catch (error) {
    console.error("Failed to update moderation report", error);
    return NextResponse.json(
      { error: "Could not update moderation report." },
      { status: 500 },
    );
  }
}
