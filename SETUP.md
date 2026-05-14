# Complete Database + Clerk Setup Guide

This guide walks through setting up Prisma, PostgreSQL, and Clerk webhooks for Meshy Links.

## Prerequisites

- Node.js 18+ installed
- A Clerk account (already configured)
- PostgreSQL available (local or cloud)

## Step 1: Database Connection

### Option A: Local Development (Recommended)

The easiest way - uses Prisma's built-in local Postgres:

```bash
npx prisma dev
```

This will:
1. Start a local PostgreSQL server
2. Show you a `DATABASE_URL` connection string
3. Open Prisma Studio at `http://localhost:5555`

**Copy the shown DATABASE_URL** and add it to `.env.local`:

```env
DATABASE_URL="postgresql://..."
```

Then start your Next.js app in another terminal:

```bash
npm run dev
```

### Option B: Cloud PostgreSQL

Use one of these services (all have free tiers):

- **[Neon](https://neon.tech)** - Serverless Postgres (recommended)
- **[Supabase](https://supabase.com)** - Postgres + extras
- **[Railway](https://railway.app)** - Simple hosting
- **[Vercel Postgres](https://vercel.com/storage/postgres)** - Vercel-native

Steps:
1. Create a new project
2. Get the PostgreSQL connection string
3. Add to `.env.local`:
   ```env
   DATABASE_URL="postgresql://user:password@host:5432/database"
   ```

## Step 2: Push Schema to Database

With `DATABASE_URL` set, push the schema:

```bash
npm run db:push
```

This creates all tables from `prisma/schema.prisma`.

## Step 3: Configure Clerk Webhook

The webhook syncs Clerk users with your database. Every time someone signs up, updates their profile, or deletes their account, the database stays in sync.

### In Clerk Dashboard:

1. Go to **Webhooks** in [Clerk Dashboard](https://dashboard.clerk.com)
2. Click **+ Create**
3. For the endpoint URL, enter:
   ```
   https://yourdomain.com/api/webhooks/clerk
   ```
   
   For local development with ngrok:
   ```bash
   npx ngrok http 3000
   ```
   Then use:
   ```
   https://your-ngrok-url.ngrok.io/api/webhooks/clerk
   ```

4. Select these events:
   - user.created
   - user.updated
   - user.deleted

5. Copy the **Webhook Secret** (starts with `whsec_`)

6. Add to `.env.local`:
   ```env
   CLERK_WEBHOOK_SECRET="whsec_your_secret_here"
   ```

## Step 4: Seed Sample Data (Optional)

Add sample users/posts for testing:

```bash
npm run db:seed
```

This creates sample users and relationships.

## Step 5: Error Alert Emails (Optional)

Server and browser error alerts are sent with the existing SendGrid config. They default to `sydneywells103@gmail.com`, or you can override recipients:

```env
ERROR_ALERT_EMAILS="you@example.com,other@example.com"
```

Required SendGrid values:

```env
SENDGRID_API_KEY="SG..."
SENDGRID_FROM_EMAIL="alerts@yourdomain.com"
```

## Step 6: Browse Your Database

Open Prisma Studio:

```bash
npm run db:studio
```

This opens a web UI at `http://localhost:5555` where you can:
- View all tables
- Add/edit records
- Explore relationships

## Useful Commands

```bash
# Start with local Postgres
npm run db:dev

# Push pending changes
npm run db:push

# Create migrations (for tracked schema changes)
npm run db:migrate

# View/edit data in UI
npm run db:studio

# Seed with sample data
npm run db:seed

# Start Next.js app
npm run dev

# Check TypeScript
npm run typecheck

# Lint code
npm run lint
```

## Folder Structure

```
prisma/
  schema.prisma    # Database schema (all models)
  seed.ts          # Sample data to load

src/
  lib/
    prisma.ts      # Prisma client singleton
    prisma-queries.ts  # Helper functions for queries
  types/
    models.ts      # TypeScript types
  app/
    api/
      webhooks/
        clerk/
          route.ts  # Clerk webhook handler
```

## Next Steps

After setup is complete:

1. **Update Components** - Replace JSON data in pages with Prisma queries
   - Use functions from `src/lib/prisma-queries.ts`
   - Example: `const users = await getAllUsers()`

2. **Create API Routes** - Add endpoints for CRUD operations
   - `/api/users` - Get/update profiles
   - `/api/posts` - Create/delete posts
   - `/api/events` - Manage events
   - etc.

3. **Add Protected Routes** - Require login for certain pages
   - Use Clerk's `auth()` helper
   - Redirect to login if not authenticated

4. **Test Webhook** - Sign up in your app and check:
   - User appears in database (Prisma Studio)
   - Profile page shows real user data

## Troubleshooting

**Database connection fails:**
- Check `DATABASE_URL` in `.env.local`
- Make sure Postgres is running (if local)
- Verify credentials

**Webhook not firing:**
- Check CLERK_WEBHOOK_SECRET in `.env.local`
- Ensure endpoint is publicly accessible (use ngrok for local)
- Check Clerk Dashboard > Webhooks > Logs

**Tables not created:**
- Run `npm run db:push`
- Look for errors in terminal output

**Type errors in code:**
- Run `npm run typecheck`
- Ensure Prisma types are generated: `npx prisma generate`

## Schema Reference

### User
```prisma
User {
  id, clerkId (unique), name, handle, email, bio, location,
  interests, pronouns, profileImage, links, featured
}
```

### Post
```prisma
Post {
  id, userId, content, timestamp, tags, likes, comments
}
```

### Event
```prisma
Event {
  id, title, description, date, location, type, createdBy
}
```

### Message
```prisma
Message {
  id, senderId, recipientId, content, read, createdAt
}
```

### Relationship
```prisma
Relationship {
  id, user1Id, user2Id, type
}
```

See `prisma/schema.prisma` for full details.
