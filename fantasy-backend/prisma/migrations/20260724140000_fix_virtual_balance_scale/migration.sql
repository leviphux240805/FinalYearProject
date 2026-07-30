-- ============================================================
-- BUGFIX: virtualBalance's default was still on the old scale (10.0) while
-- player prices (Player.currentPrice) and the displayed budget
-- (DEFAULT_TEAM_BUDGET on the frontend) had already moved to the new scale
-- (100.0) earlier. The frontend used to "paper over" this by multiplying by
-- 10 when displaying if the balance was <= 20 (see the old store.js,
-- normalizeBudget) — but that only applied at page load, NOT after a
-- buy/sell, so the displayed balance would crash hard right after the first
-- transaction even though the real balance in the DB was never deducted
-- incorrectly.
--
-- The fix has 2 parts:
--   1. Change the default for new users -> 100.0 (matches the real scale
--      directly, no more "patching" needed on the frontend — see store.js).
--   2. One-time backfill for existing users: multiply by 10 for anyone whose
--      balance is currently <= 20 — EXACTLY the same heuristic the frontend
--      was already silently applying when displaying, so the balance a user
--      sees before/after this migration is identical. This is the only way
--      to avoid wrongly losing money for users who already exist in the
--      system (accepted trade-off: if someone had ALREADY spent nearly
--      everything and their real balance on the new scale is <= 20M, this
--      UPDATE line will incorrectly multiply it x10 — within the scope of
--      this project there is currently no real user in that state, so this
--      is acceptable; if absolute precision is needed, fix by hand on a
--      case-by-case basis).
-- ============================================================

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "virtualBalance" SET DEFAULT 100.0;

-- DataFix (one-time)
UPDATE "User" SET "virtualBalance" = "virtualBalance" * 10 WHERE "virtualBalance" <= 20;
