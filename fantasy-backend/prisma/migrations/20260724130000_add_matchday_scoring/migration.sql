-- AlterTable
ALTER TABLE "SquadPick" ADD COLUMN "points" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "UserSquad" ADD COLUMN "totalPoints" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PlayerGameweekStat" (
    "id" TEXT NOT NULL,
    "playerId" INTEGER NOT NULL,
    "gameweek" INTEGER NOT NULL,
    "minutesPlayed" INTEGER NOT NULL DEFAULT 0,
    "goals" INTEGER NOT NULL DEFAULT 0,
    "assists" INTEGER NOT NULL DEFAULT 0,
    "yellowCards" INTEGER NOT NULL DEFAULT 0,
    "redCards" INTEGER NOT NULL DEFAULT 0,
    "cleanSheet" BOOLEAN NOT NULL DEFAULT false,
    "saves" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PlayerGameweekStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayerGameweekStat_playerId_gameweek_key" ON "PlayerGameweekStat"("playerId", "gameweek");

-- AddForeignKey
ALTER TABLE "PlayerGameweekStat" ADD CONSTRAINT "PlayerGameweekStat_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
