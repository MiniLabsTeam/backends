// Quick script to check rooms and prediction pools
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('=== CHECKING ROOMS ===');
  const rooms = await prisma.room.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: {
      players: true,
    },
  });

  console.log('Recent rooms:');
  rooms.forEach((r) => {
    console.log(`  ${r.roomUid} - ${r.status} - ${r.gameMode} - ${r.players.length}/${r.maxPlayers} - ${r.createdAt}`);
  });

  console.log('\n=== CHECKING PREDICTION POOLS ===');
  const pools = await prisma.predictionPool.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      roomUid: true,
      totalPool: true,
      isSettled: true,
      actualWinner: true,
      createdAt: true,
    },
  });

  console.log('Recent prediction pools:');
  pools.forEach((p) => {
    console.log(`  Pool ${p.id} - Room: ${p.roomUid} - Total: ${p.totalPool} - Settled: ${p.isSettled} - Winner: ${p.actualWinner || 'N/A'}`);
  });

  console.log('\n=== CHECKING ACTIVE (RACING) ROOMS ===');
  const activeRooms = await prisma.room.findMany({
    where: { status: 'RACING' },
    include: {
      players: true,
    },
  });

  console.log(`Found ${activeRooms.length} active racing rooms`);
  activeRooms.forEach((r) => {
    console.log(`  ${r.roomUid} - ${r.players.length} players`);
  });
}

main()
  .catch((e) => {
    console.error('Error:', e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
