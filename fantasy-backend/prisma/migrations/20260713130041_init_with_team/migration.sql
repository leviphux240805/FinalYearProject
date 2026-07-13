-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "virtualBalance" DECIMAL(5,1) NOT NULL DEFAULT 10.0,
    "penaltyPoints" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "currentPrice" DECIMAL(5,1) NOT NULL,
    "teamId" INTEGER NOT NULL,
    "form" TEXT[],

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "possessionRate" DECIMAL(5,2) NOT NULL,
    "defensiveBlock" DECIMAL(5,2) NOT NULL,
    "attackingPassing" DECIMAL(5,2) NOT NULL,
    "counterAttack" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSquad" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameweek" INTEGER NOT NULL,
    "captainId" INTEGER,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "UserSquad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SquadPick" (
    "id" TEXT NOT NULL,
    "squadId" TEXT NOT NULL,
    "playerId" INTEGER NOT NULL,
    "isStarting" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SquadPick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "playerId" INTEGER,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(5,1) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "UserSquad_userId_gameweek_key" ON "UserSquad"("userId", "gameweek");

-- AddForeignKey
ALTER TABLE "UserSquad" ADD CONSTRAINT "UserSquad_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SquadPick" ADD CONSTRAINT "SquadPick_squadId_fkey" FOREIGN KEY ("squadId") REFERENCES "UserSquad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SquadPick" ADD CONSTRAINT "SquadPick_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;
