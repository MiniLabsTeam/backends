/**
 * Test Concurrent HTTP Bets - Verify Race Condition Fix
 * 
 * This simulates concurrent HTTP requests to the betting endpoint
 * to test if the race condition fix works properly
 */

import axios, { AxiosError } from 'axios';

const API_BASE = 'http://localhost:3001';

// Test user wallets
const testWallets = [
  '0x3c7039f4c1156c30577174a9d3ff4cf8039a71aa1de690a9fd12f909b82c503c',
  '0x48b00f40d87902b18707c40662e723b1ee1da31f2a952c1794d4cf9a94a0b822',
  '0x0ca4ad22de1daf917cfaafe8b8dd17a1309236358fc59360888f4edeaccf42b2',
];

const OCT_DECIMALS = 9;

async function testConcurrentBets() {
  try {
    console.log('\n' + '═'.repeat(80));
    console.log('🧪 TESTING CONCURRENT HTTP BETS - Race Condition Fix Verification');
    console.log('═'.repeat(80) + '\n');

    console.log('⚠️  This test requires:');
    console.log('   1. Backend running on http://localhost:3001');
    console.log('   2. Test users with balances > 5 OCT');
    console.log('   3. Valid JWT tokens for test users\n');

    // Get first active pool (unsettled)
    const poolsResponse = await axios.get(`${API_BASE}/api/prediction/pools`);
    const pools = poolsResponse.data.data || [];
    
    const activePool = pools.find((p: any) => !p.isSettled);
    
    if (!activePool) {
      console.log('❌ No active unsettled pools found');
      console.log('   Create a new room for testing first\n');
      process.exit(0);
    }

    console.log(`✅ Using pool: ${activePool.id}`);
    console.log(`   Current total: ${(Number(activePool.totalPool) / 10 ** OCT_DECIMALS).toFixed(2)} OCT\n`);

    // Simulate 3 concurrent bets
    const betAmount = 1; // 1 OCT
    console.log(`Placing 3 concurrent bets of ${betAmount} OCT each...\n`);

    const betPromises = testWallets.map(async (wallet) => {
      try {
        // This would need a valid token - for now just show what would happen
        const response = await axios.post(
          `${API_BASE}/api/prediction/bet`,
          {
            poolId: activePool.id,
            amount: betAmount,
            predictedWinnerId: '1',
          },
          {
            headers: {
              'Authorization': `Bearer YOUR_JWT_TOKEN_HERE`, // Would need real token
            },
          }
        );
        return { success: true, wallet: wallet.substring(0, 20), data: response.data };
      } catch (error: any) {
        return {
          success: false,
          wallet: wallet.substring(0, 20),
          error: error.response?.data?.message || error.message,
        };
      }
    });

    const results = await Promise.all(betPromises);

    console.log('📊 Results:');
    results.forEach((result) => {
      if (result.success) {
        console.log(`✅ ${result.wallet}... - Bet placed`);
      } else {
        console.log(`❌ ${result.wallet}... - ${result.error}`);
      }
    });

    // Get updated pool
    const updatedPoolResponse = await axios.get(`${API_BASE}/api/prediction/pools/${activePool.id}`);
    const updatedPool = updatedPoolResponse.data.data;

    console.log(`\n✅ Final pool total: ${(Number(updatedPool.totalPool) / 10 ** OCT_DECIMALS).toFixed(2)} OCT`);
    console.log('   (Should be around 3 OCT if all bets succeeded)\n');

  } catch (error: any) {
    if (error.code === 'ECONNREFUSED') {
      console.log('❌ Cannot connect to backend on http://localhost:3001');
      console.log('   Please start the backend server first\n');
    } else {
      console.error('\n❌ Error:', error.message);
    }
  }
}

testConcurrentBets();
