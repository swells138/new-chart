#!/usr/bin/env bash
set -euo pipefail

# Generates a necessary migration for the Prisma schema changes added.
# You'll need prisma installed as a dev dependency and a DATABASE_URL set.
# Run: ./scripts/add-prisma-migration.sh "add stripe fields to user"

MSG=${1:-"add stripe fields to user"}

npx prisma migrate dev --name "${MSG}" --create-only

echo "Migration created. Apply with: npx prisma migrate deploy"
