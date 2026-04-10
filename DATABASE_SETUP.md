# Database Setup Guide

This project uses Prisma with PostgreSQL for data management.

## Quick Start

### Option 1: Local Prisma Postgres (Recommended for Development)

The easiest way to get started locally:

```bash
npx prisma dev
```

This command:
- Starts a local PostgreSQL instance
- Automatically creates and syncs your database schema
- Opens Prisma Studio so you can view/edit data
- Provides you with a `DATABASE_URL` to use

**Copy the DATABASE_URL** from the Prisma dev output into your `.env.local` file.

### Option 2: Cloud PostgreSQL (Neon, Supabase, Railway, etc.)

1. Create a free PostgreSQL database:
   - [Neon](https://neon.tech) (recommended, free tier)
   - [Supabase](https://supabase.com)
   - [Railway](https://railway.app)
   - [Vercel Postgres](https://vercel.com/storage/postgres)

2. Copy your `DATABASE_URL` connection string

3. Add it to `.env.local`:
   ```
   DATABASE_URL="postgresql://user:password@host:5432/database"
   ```

4. Push the schema:
   ```bash
   npm run db:push
   ```

## Available Commands

```bash
# Start local Postgres + Prisma Studio
npm run db:dev

# Push schema to database (use when DATABASE_URL is set)
npm run db:push

# Create migrations (tracks schema changes)
npm run db:migrate

# Open Prisma Studio (visual database browser)
npm run db:studio

# Seed sample data
npm run db:seed
```

## Schema Overview

The database includes:

- **User** - User profiles (synced with Clerk auth)
- **Post** - User posts/updates
- **Event** - Community events
- **EventAttendee** - Track who's attending events
- **Article** - Blog articles/stories
- **Message** - Direct messages between users
- **Relationship** - Connections between users (friends, collaborators, etc.)

## Syncing with Clerk

When a user signs up with Clerk:
1. Clerk creates a user account
2. A webhook should create a corresponding User record in Prisma
3. User's clerkId links the two systems

See `src/app/api/webhooks/clerk.ts` for the webhook handler.

## Development Workflow

1. Start with `npx prisma dev` (or set DATABASE_URL and run your app)
2. Make schema changes in `prisma/schema.prisma`
3. Run migrations: `npm run db:migrate`
4. Use Prisma Studio to browse/edit data: `npm run db:studio`

## Moving to Production

For production deployment (Vercel, etc.):

1. Set DATABASE_URL environment variable in deployment settings
2. Add a build step to push migrations: `prisma db push`
3. Consider using Vercel Postgres or a managed service like Neon

They'll handle backups, scaling, and security.
