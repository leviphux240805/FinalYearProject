// ============================================================
// Seeds the 10 curated Team rows (matching BACKUP_PLAYERS' team_id
// range in server.js / data/backupPlayers.js) so TacticalFitService
// (Algorithm 3) has real teamStats to work with instead of always
// falling back to the league-average default.
// ============================================================
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const TEAMS = [
  { id: 1,  name: 'Paris Saint-Germain', possessionRate: 63, defensiveBlock: 58, attackingPassing: 78, counterAttack: 75 },
  { id: 2,  name: 'Arsenal',             possessionRate: 60, defensiveBlock: 72, attackingPassing: 80, counterAttack: 60 },
  { id: 3,  name: 'Barcelona',           possessionRate: 70, defensiveBlock: 55, attackingPassing: 85, counterAttack: 55 },
  { id: 4,  name: 'Manchester City',     possessionRate: 88, defensiveBlock: 65, attackingPassing: 90, counterAttack: 50 },
  { id: 5,  name: 'Liverpool',           possessionRate: 62, defensiveBlock: 60, attackingPassing: 75, counterAttack: 80 },
  { id: 6,  name: 'Real Madrid',         possessionRate: 58, defensiveBlock: 62, attackingPassing: 78, counterAttack: 85 },
  { id: 7,  name: 'Bayern Munich',       possessionRate: 65, defensiveBlock: 60, attackingPassing: 82, counterAttack: 65 },
  { id: 8,  name: 'Aston Villa',         possessionRate: 50, defensiveBlock: 62, attackingPassing: 62, counterAttack: 58 },
  { id: 9,  name: 'Newcastle United',    possessionRate: 48, defensiveBlock: 68, attackingPassing: 60, counterAttack: 72 },
  { id: 10, name: 'Chelsea',             possessionRate: 55, defensiveBlock: 58, attackingPassing: 68, counterAttack: 62 }
];

async function seedTeams() {
  console.log('⏳ Đang nạp dữ liệu 10 CLB curated (Team) vào PostgreSQL...');
  for (const team of TEAMS) {
    await prisma.team.upsert({ where: { id: team.id }, update: team, create: team });
  }
  console.log(`✅ Đã nạp xong ${TEAMS.length} CLB.`);
}

seedTeams()
  .catch((err) => {
    console.error('❌ Seed Team thất bại:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
