-- ============================================================
-- Adds refresh-token rotation support: only the SHA-256 hash of a random
-- token identifier (`jti`) is stored, never the raw token itself, so a DB
-- read alone can't be used to forge a valid refresh token.
-- ============================================================

-- AlterTable
ALTER TABLE "User" ADD COLUMN "refreshTokenHash" TEXT,
ADD COLUMN "refreshTokenExpiresAt" TIMESTAMP(3);
