import { NextResponse } from "next/server";
import { z } from "zod";
import { isCurrentUserModerator } from "@/lib/moderation/auth";
import { clearUserLock, listUserLocks } from "@/lib/moderation/reports";

const deleteSchema = z
  .object({
    userId: z.string().trim().min(1).max(120),
  })
  .strict();

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
    const locks = await listUserLocks(300);
    return NextResponse.json({ locks });
  } catch (error) {
    console.error("Failed to list user locks", error);
    return NextResponse.json(
      { error: "Could not load active locks." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
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

  const parsed = deleteSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  try {
    const removed = await clearUserLock(parsed.data.userId);
    if (!removed) {
      return NextResponse.json({ error: "Lock not found." }, { status: 404 });
    }

    return NextResponse.json({ unlockedUserId: removed.userId });
  } catch (error) {
    console.error("Failed to clear user lock", error);
    return NextResponse.json(
      { error: "Could not clear user lock." },
      { status: 500 },
    );
  }
}
