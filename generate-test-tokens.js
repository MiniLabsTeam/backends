/**
 * Generate JWT Tokens untuk Local Testing
 *
 * Usage:
 *   node generate-test-tokens.js
 */

const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const path = require('path');

// Load .env file
dotenv.config({ path: path.join(__dirname, '.env') });

const JWT_SECRET = process.env.JWT_SECRET || 'local-testing-secret-key-onechain-racing-2024';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

console.log('\n' + '='.repeat(80));
console.log('🔑 ONECHAIN RACING - JWT TOKEN GENERATOR');
console.log('='.repeat(80));
console.log(`📝 JWT_SECRET: ${JWT_SECRET.substring(0, 20)}...`);
console.log(`⏰ Expires In: ${JWT_EXPIRES_IN}`);
console.log('='.repeat(80) + '\n');

// Generate tokens untuk 4 players
const players = [
  { address: '0xPlayer1TestAddress', username: 'Player1', carUid: '0xCAR1' },
  { address: '0xPlayer2TestAddress', username: 'Player2', carUid: '0xCAR2' },
  { address: '0xPlayer3TestAddress', username: 'Player3', carUid: '0xCAR3' },
  { address: '0xPlayer4TestAddress', username: 'Player4', carUid: '0xCAR4' },
];

players.forEach((player, index) => {
  const payload = {
    address: player.address,
    username: player.username,
    timestamp: Date.now(),
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

  console.log(`👤 PLAYER ${index + 1}: ${player.username}`);
  console.log('-'.repeat(80));
  console.log(`Address:  ${player.address}`);
  console.log(`Car UID:  ${player.carUid}`);
  console.log(`Token:    ${token}`);
  console.log('-'.repeat(80) + '\n');
});

console.log('📋 QUICK SETUP INSTRUCTIONS:');
console.log('='.repeat(80));
console.log('1. Copy token dari Player 1 atau Player 2');
console.log('2. Buka http://localhost:5500 (atau port frontend Anda)');
console.log('3. Paste ke field "JWT Token"');
console.log('4. Isi Player Address dan Car UID sesuai player yang dipilih');
console.log('5. Press Tab atau klik luar untuk trigger WebSocket connection');
console.log('='.repeat(80) + '\n');

console.log('💡 TIPS:');
console.log('- Gunakan 2 browser (normal + incognito) untuk test 2 players');
console.log('- Token berlaku selama 7 hari');
console.log('- Jika error "JWT expired", generate ulang token ini\n');

// Verify salah satu token
try {
  const testToken = jwt.sign({ address: players[0].address }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  const decoded = jwt.verify(testToken, JWT_SECRET);
  console.log('✅ Token verification test: PASSED');
  console.log(`✅ Decoded payload: ${JSON.stringify(decoded, null, 2)}\n`);
} catch (error) {
  console.error('❌ Token verification test: FAILED');
  console.error('❌ Error:', error.message);
  console.error('⚠️  Check your JWT_SECRET in .env file!\n');
}
