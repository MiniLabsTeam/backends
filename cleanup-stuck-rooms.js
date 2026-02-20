// Clean up stuck RACING rooms
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Cleaning up stuck RACING rooms...');

  const stuckRooms = await prisma.room.findMany({
    where: { status: 'RACING' },
  });

  console.log(`Found ${stuckRooms.length} stuck rooms`);

  for (const room of stuckRooms) {
    console.log(`Cleaning up: ${room.roomUid}`);

    // Update room to FINISHED
    await prisma.room.update({
      where: { id: room.id },
      data: {
        status: 'FINISHED',
        finishedAt: new Date(),
      },
    });
  }

  console.log('✅ Cleanup complete!');
}

main()
  .catch((e) => {
    console.error('Error:', e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
