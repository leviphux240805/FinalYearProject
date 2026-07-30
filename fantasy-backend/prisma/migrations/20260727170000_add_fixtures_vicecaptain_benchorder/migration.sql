-- ============================================================
-- Part A gameplay-feedback fixes (see checklist-feedback-giangvien.md):
--  - viceCaptainId on UserSquad: server-side home for the Vice-Captain
--    armband, so matchdayService can actually auto-promote it when the
--    Captain records 0 minutes played (previously purely a client-side
--    decoration in store.js/SquadPitch.vue with no backend effect).
--  - benchOrder on SquadPick: substitute priority (1st, 2nd, 3rd...) used
--    by the new auto-substitution pass in matchdayService.
--  - Fixture: mock/generated match schedule + a simple pre-match prediction
--    (expected goals + win/draw/win probabilities), computed once at seed
--    time from Team tactical stats. See prisma/schema.prisma for the full
--    rationale (no live fixture provider wired up while clubs are in their
--    off-season break).
-- ============================================================

-- AlterTable
ALTER TABLE "UserSquad" ADD COLUMN "viceCaptainId" INTEGER;

-- AlterTable
ALTER TABLE "SquadPick" ADD COLUMN "benchOrder" INTEGER;

-- CreateTable
CREATE TABLE "Fixture" (
    "id" SERIAL NOT NULL,
    "gameweek" INTEGER NOT NULL,
    "homeTeamId" INTEGER NOT NULL,
    "awayTeamId" INTEGER NOT NULL,
    "homeTeamName" TEXT NOT NULL,
    "awayTeamName" TEXT NOT NULL,
    "kickoff" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "homeExpectedGoals" DOUBLE PRECISION NOT NULL,
    "awayExpectedGoals" DOUBLE PRECISION NOT NULL,
    "homeWinProb" DOUBLE PRECISION NOT NULL,
    "drawProb" DOUBLE PRECISION NOT NULL,
    "awayWinProb" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Fixture_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Fixture_gameweek_idx" ON "Fixture"("gameweek");

-- CreateIndex
CREATE UNIQUE INDEX "Fixture_gameweek_homeTeamId_awayTeamId_key" ON "Fixture"("gameweek", "homeTeamId", "awayTeamId");
