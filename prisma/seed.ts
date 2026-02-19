/**
 * Prisma Seed Script for Local Testing
 *
 * Usage: npx prisma db seed
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database with test data...\n');

  // 1. Create Test Users
  console.log('👥 Creating test users...');

  const users = await Promise.all([
    prisma.user.upsert({
      where: { address: '0xPlayer1TestAddress' },
      update: {},
      create: {
        address: '0xPlayer1TestAddress',
        username: 'TestPlayer1',
      },
    }),
    prisma.user.upsert({
      where: { address: '0xPlayer2TestAddress' },
      update: {},
      create: {
        address: '0xPlayer2TestAddress',
        username: 'TestPlayer2',
      },
    }),
    prisma.user.upsert({
      where: { address: '0xPlayer3TestAddress' },
      update: {},
      create: {
        address: '0xPlayer3TestAddress',
        username: 'TestPlayer3',
      },
    }),
    prisma.user.upsert({
      where: { address: '0xPlayer4TestAddress' },
      update: {},
      create: {
        address: '0xPlayer4TestAddress',
        username: 'TestPlayer4',
      },
    }),
  ]);

  console.log(`✅ Created ${users.length} users\n`);

  // 2. Create Test Cars (NFTs)
  console.log('🚗 Creating test cars...');

  const cars = await Promise.all([
    prisma.car.upsert({
      where: { uid: '0xCAR1' },
      update: {},
      create: {
        uid: '0xCAR1',
        owner: '0xPlayer1TestAddress',
        name: 'Speedster Alpha',
        brand: 0, // Lamborghini
        rarity: 0, // Common
        slotLimit: 2,
        baseSpeed: 70,
        baseAcceleration: 68,
        baseHandling: 65,
        baseDrift: 60,
      },
    }),
    prisma.car.upsert({
      where: { uid: '0xCAR2' },
      update: {},
      create: {
        uid: '0xCAR2',
        owner: '0xPlayer2TestAddress',
        name: 'Racer Pro',
        brand: 1, // Ferrari
        rarity: 1, // Rare
        slotLimit: 3,
        baseSpeed: 85,
        baseAcceleration: 75,
        baseHandling: 60,
        baseDrift: 70,
      },
    }),
    prisma.car.upsert({
      where: { uid: '0xCAR3' },
      update: {},
      create: {
        uid: '0xCAR3',
        owner: '0xPlayer3TestAddress',
        name: 'Drift King',
        brand: 2, // Ford
        rarity: 0, // Common
        slotLimit: 2,
        baseSpeed: 65,
        baseAcceleration: 70,
        baseHandling: 80,
        baseDrift: 85,
      },
    }),
    prisma.car.upsert({
      where: { uid: '0xCAR4' },
      update: {},
      create: {
        uid: '0xCAR4',
        owner: '0xPlayer4TestAddress',
        name: 'Thunder Beast',
        brand: 3, // Chevrolet
        rarity: 2, // Epic
        slotLimit: 4,
        baseSpeed: 90,
        baseAcceleration: 88,
        baseHandling: 85,
        baseDrift: 80,
      },
    }),
  ]);

  console.log(`✅ Created ${cars.length} cars\n`);

  // 3. Display Summary
  console.log('📋 TEST CREDENTIALS:');
  console.log('='.repeat(60));

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    const car = cars[i];
    const rarityNames = ['Common', 'Rare', 'Epic', 'Legendary'];
    console.log(`\nPlayer ${i + 1}:`);
    console.log(`  Address:  ${user.address}`);
    console.log(`  Username: ${user.username}`);
    console.log(`  Car UID:  ${car.uid}`);
    console.log(`  Car Name: ${car.name}`);
    console.log(`  Rarity:   ${rarityNames[car.rarity]}`);
    console.log(`  Stats:    Speed ${car.baseSpeed}, Handling ${car.baseHandling}, Accel ${car.baseAcceleration}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Seeding completed successfully!\n');
  console.log('💡 Next steps:');
  console.log('1. Generate JWT tokens: node generate-test-tokens.js');
  console.log('2. Start backend: npm run dev');
  console.log('3. Open frontend and use the credentials above');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
