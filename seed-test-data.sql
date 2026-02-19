-- ============================================
-- ONECHAIN RACING - DUMMY DATA FOR LOCAL TESTING
-- ============================================
-- Jalankan script ini setelah prisma migrate
-- Usage: psql -U postgres -d onechain_racing -f seed-test-data.sql

-- Connect to database
\c onechain_racing

-- ============================================
-- 1. Insert Test Users
-- ============================================
INSERT INTO "User" (address, username, "nftCount", "createdAt", "updatedAt")
VALUES
  ('0xPlayer1TestAddress', 'TestPlayer1', 1, NOW(), NOW()),
  ('0xPlayer2TestAddress', 'TestPlayer2', 1, NOW(), NOW()),
  ('0xPlayer3TestAddress', 'TestPlayer3', 1, NOW(), NOW()),
  ('0xPlayer4TestAddress', 'TestPlayer4', 1, NOW(), NOW())
ON CONFLICT (address) DO UPDATE SET
  username = EXCLUDED.username,
  "updatedAt" = NOW();

-- ============================================
-- 2. Insert Test Cars (NFTs)
-- ============================================
INSERT INTO "CarNFT" (
  uid,
  "ownerAddress",
  rarity,
  speed,
  handling,
  acceleration,
  "nftId",
  "createdAt",
  "updatedAt"
)
VALUES
  -- Player 1 Car (Common - Balanced)
  (
    '0xCAR1',
    '0xPlayer1TestAddress',
    'COMMON',
    70,
    65,
    68,
    'car_nft_001',
    NOW(),
    NOW()
  ),

  -- Player 2 Car (Rare - Speed Focus)
  (
    '0xCAR2',
    '0xPlayer2TestAddress',
    'RARE',
    85,
    60,
    75,
    'car_nft_002',
    NOW(),
    NOW()
  ),

  -- Player 3 Car (Common - Handling Focus)
  (
    '0xCAR3',
    '0xPlayer3TestAddress',
    'COMMON',
    65,
    80,
    70,
    'car_nft_003',
    NOW(),
    NOW()
  ),

  -- Player 4 Car (Epic - All-rounder)
  (
    '0xCAR4',
    '0xPlayer4TestAddress',
    'EPIC',
    90,
    85,
    88,
    'car_nft_004',
    NOW(),
    NOW()
  )
ON CONFLICT (uid) DO UPDATE SET
  "ownerAddress" = EXCLUDED."ownerAddress",
  rarity = EXCLUDED.rarity,
  speed = EXCLUDED.speed,
  handling = EXCLUDED.handling,
  acceleration = EXCLUDED.acceleration,
  "updatedAt" = NOW();

-- ============================================
-- 3. Verify Data
-- ============================================
\echo '\n============================================'
\echo '✅ Test Data Inserted Successfully!'
\echo '============================================\n'

\echo '👥 Users:'
SELECT address, username, "nftCount" FROM "User" WHERE address LIKE '0xPlayer%TestAddress';

\echo '\n🚗 Cars:'
SELECT uid, "ownerAddress", rarity, speed, handling, acceleration FROM "CarNFT" WHERE uid LIKE '0xCAR%';

\echo '\n============================================'
\echo '📋 CREDENTIALS FOR TESTING:'
\echo '============================================'
\echo ''
\echo 'Player 1:'
\echo '  Address: 0xPlayer1TestAddress'
\echo '  Car UID: 0xCAR1'
\echo '  Stats:   Speed 70, Handling 65, Accel 68'
\echo ''
\echo 'Player 2:'
\echo '  Address: 0xPlayer2TestAddress'
\echo '  Car UID: 0xCAR2'
\echo '  Stats:   Speed 85, Handling 60, Accel 75'
\echo ''
\echo 'Player 3:'
\echo '  Address: 0xPlayer3TestAddress'
\echo '  Car UID: 0xCAR3'
\echo '  Stats:   Speed 65, Handling 80, Accel 70'
\echo ''
\echo 'Player 4:'
\echo '  Address: 0xPlayer4TestAddress'
\echo '  Car UID: 0xCAR4'
\echo '  Stats:   Speed 90, Handling 85, Accel 88'
\echo ''
\echo '============================================'
\echo '💡 NEXT STEPS:'
\echo '============================================'
\echo '1. Generate JWT tokens:'
\echo '   cd backend && node generate-test-tokens.js'
\echo ''
\echo '2. Start backend:'
\echo '   npm run dev'
\echo ''
\echo '3. Open frontend dan paste token'
\echo '============================================\n'
