-- ============================================================
-- Adds support for social login (Google / Facebook / X) alongside the
-- existing username+password accounts. passwordHash becomes nullable since
-- an OAuth-only account never sets one; each provider gets its own nullable
-- unique ID column so an OAuth identity maps to exactly one User row.
-- ============================================================

-- AlterTable
ALTER TABLE "User"
  ALTER COLUMN "passwordHash" DROP NOT NULL,
  ADD COLUMN "authProvider" TEXT NOT NULL DEFAULT 'local',
  ADD COLUMN "googleId" TEXT,
  ADD COLUMN "facebookId" TEXT,
  ADD COLUMN "twitterId" TEXT,
  ADD COLUMN "avatarUrl" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
CREATE UNIQUE INDEX "User_facebookId_key" ON "User"("facebookId");
CREATE UNIQUE INDEX "User_twitterId_key" ON "User"("twitterId");
