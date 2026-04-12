import { Webhook } from "svix";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

type ClerkWebhookEvent = {
  type: "user.created" | "user.updated" | "user.deleted";
  data: {
    id?: string | null;
    email_addresses?: Array<{ email_address: string }>;
    phone_numbers?: Array<{ phone_number: string }>;
    first_name?: string | null;
    last_name?: string | null;
  };
};

export async function POST(req: Request) {
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("Missing CLERK_WEBHOOK_SECRET");
    return new Response("Webhook is not configured", {
      status: 503,
    });
  }

  // Get the headers
  const headerPayload = await headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  // If no headers provided, error out
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response("Error occured -- no svix headers", {
      status: 400,
    });
  }

  // Get the raw body for Svix verification
  const body = await req.text();

  // Create a new Svix instance with your secret.
  const wh = new Webhook(webhookSecret);

  let evt: ClerkWebhookEvent;
  // Verify the payload
  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as ClerkWebhookEvent;
  } catch (err) {
    console.error("Error verifying webhook:", err);
    return new Response("Error occured", {
      status: 400,
    });
  }

  // Handle the webhook
  const eventType = evt.type;

  if (eventType === "user.created") {
    const { id, email_addresses, phone_numbers, first_name, last_name } = evt.data;

    if (!id) {
      return new Response("Missing user id", { status: 400 });
    }

    try {
      await prisma.user.upsert({
        where: { clerkId: id },
        create: {
          clerkId: id,
          handle: null,
          email: email_addresses?.[0]?.email_address,
          phoneNumber: phone_numbers?.[0]?.phone_number,
          name: `${first_name || ""} ${last_name || ""}`.trim(),
        },
        update: {
          email: email_addresses?.[0]?.email_address,
          phoneNumber: phone_numbers?.[0]?.phone_number,
          name: `${first_name || ""} ${last_name || ""}`.trim(),
        },
      });
    } catch (error) {
      console.error("Failed to upsert created Clerk user", error);
      return new Response("Failed to sync user", { status: 500 });
    }
  }

  if (eventType === "user.updated") {
    const { id, email_addresses, phone_numbers, first_name, last_name } = evt.data;

    if (!id) {
      return new Response("Missing user id", { status: 400 });
    }

    try {
      await prisma.user.upsert({
        where: { clerkId: id },
        create: {
          clerkId: id,
          handle: null,
          email: email_addresses?.[0]?.email_address,
          phoneNumber: phone_numbers?.[0]?.phone_number,
          name: `${first_name || ""} ${last_name || ""}`.trim(),
        },
        update: {
          email: email_addresses?.[0]?.email_address,
          phoneNumber: phone_numbers?.[0]?.phone_number,
          name: `${first_name || ""} ${last_name || ""}`.trim(),
        },
      });
    } catch (error) {
      console.error("Failed to upsert updated Clerk user", error);
      return new Response("Failed to sync user", { status: 500 });
    }
  }

  if (eventType === "user.deleted") {
    const { id } = evt.data;

    if (!id) {
      return new Response("Missing user id", { status: 400 });
    }

    try {
      await prisma.user.deleteMany({
        where: { clerkId: id },
      });
    } catch (error) {
      console.error("Failed to delete Clerk user", error);
      return new Response("Failed to sync user deletion", { status: 500 });
    }
  }

  return new Response("Webhook received", { status: 200 });
}
