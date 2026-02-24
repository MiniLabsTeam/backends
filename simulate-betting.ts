/**
 * Simulasi Betting Prediction & Payout
 * 
 * Scenario:
 * - User A vs User B balapan (sama-sama bet untuk diri sendiri: 2 OCT each)
 * - User C bet untuk User A: 2 OCT
 * - Total pool: 6 OCT
 * - User A MENANG
 * 
 * Platform fee: 5% dari total pool
 */

const OCT_DECIMALS = 9;
const PLATFORM_FEE_PERCENT = 5; // 5%

interface Bet {
  bettor: string;
  amount: bigint; // dalam MIST
  predictedWinner: string;
}

interface Result {
  bettor: string;
  amount: string; // OCT string
  payout: string; // OCT string
}

function simulateBetting() {
  console.log('\n' + '═'.repeat(70));
  console.log('🎲 SIMULASI BETTING PREDICTION');
  console.log('═'.repeat(70));

  // Setup users
  const userA = '0xUserA';
  const userB = '0xUserB';
  const userC = '0xUserC';

  // Setup bets (dalam MIST)
  const bets: Bet[] = [
    { bettor: userA, amount: BigInt(2 * 10n ** BigInt(OCT_DECIMALS)), predictedWinner: userA },
    { bettor: userB, amount: BigInt(2 * 10n ** BigInt(OCT_DECIMALS)), predictedWinner: userB },
    { bettor: userC, amount: BigInt(2 * 10n ** BigInt(OCT_DECIMALS)), predictedWinner: userA },
  ];

  const actualWinner = userA;

  console.log('\n📋 SETUP:\n');
  console.log(`Race: ${userA} vs ${userB}`);
  console.log(`Winner: ${actualWinner}\n`);

  console.log('💰 BETS PLACED:\n');
  bets.forEach((bet, i) => {
    const amountOCT = Number(bet.amount) / (10 ** OCT_DECIMALS);
    console.log(`${i + 1}. ${bet.bettor} bet ${amountOCT.toFixed(2)} OCT on ${bet.predictedWinner}`);
  });

  // Calculate total pool
  const totalPoolMist = bets.reduce((sum, bet) => sum + bet.amount, 0n);
  const totalPoolOCT = Number(totalPoolMist) / (10 ** OCT_DECIMALS);

  console.log(`\n📊 TOTAL POOL: ${totalPoolOCT.toFixed(2)} OCT\n`);

  // Calculate platform fee
  const platformFeeMist = (totalPoolMist * BigInt(PLATFORM_FEE_PERCENT)) / 100n;
  const platformFeeOCT = Number(platformFeeMist) / (10 ** OCT_DECIMALS);
  const winnerPoolMist = totalPoolMist - platformFeeMist;
  const winnerPoolOCT = Number(winnerPoolMist) / (10 ** OCT_DECIMALS);

  console.log('💸 FEE CALCULATION:\n');
  console.log(`Platform Fee: ${PLATFORM_FEE_PERCENT}% = ${platformFeeOCT.toFixed(2)} OCT`);
  console.log(`Available for winners: ${winnerPoolOCT.toFixed(2)} OCT\n`);

  // Get winning bets
  const winningBets = bets.filter(bet => bet.predictedWinner === actualWinner);
  const totalWinningBetsMist = winningBets.reduce((sum, bet) => sum + bet.amount, 0n);
  const totalWinningBetsOCT = Number(totalWinningBetsMist) / (10 ** OCT_DECIMALS);

  console.log('🏆 WINNING BETS:\n');
  winningBets.forEach((bet, i) => {
    const amountOCT = Number(bet.amount) / (10 ** OCT_DECIMALS);
    console.log(`${i + 1}. ${bet.bettor} bet ${amountOCT.toFixed(2)} OCT on ${actualWinner}`);
  });
  console.log(`\nTotal winning bets: ${totalWinningBetsOCT.toFixed(2)} OCT\n`);

  // Calculate payouts
  const results: Result[] = [];

  console.log('═'.repeat(70));
  console.log('💵 PAYOUT CALCULATION:\n');

  winningBets.forEach((bet) => {
    // Proportional share: (bet amount / total winning) * winner pool
    const payoutMist = (bet.amount * winnerPoolMist) / totalWinningBetsMist;
    const payoutOCT = Number(payoutMist) / (10 ** OCT_DECIMALS);

    const proportion = (Number(bet.amount) / Number(totalWinningBetsMist)) * 100;

    console.log(`${bet.bettor}:`);
    console.log(`  Bet amount: ${Number(bet.amount) / (10 ** OCT_DECIMALS)} OCT`);
    console.log(`  Share percentage: ${proportion.toFixed(2)}%`);
    console.log(`  Payout: ${payoutOCT.toFixed(2)} OCT`);
    console.log('');

    results.push({
      bettor: bet.bettor,
      amount: (Number(bet.amount) / (10 ** OCT_DECIMALS)).toFixed(2),
      payout: payoutOCT.toFixed(2),
    });
  });

  // Summary
  console.log('═'.repeat(70));
  console.log('📈 FINAL RESULT:\n');

  const userAResult = results.find(r => r.bettor === userA);
  const userCResult = results.find(r => r.bettor === userC);

  console.log(`✅ ${userA} (bet 2 OCT, WINNER):`);
  console.log(`   Payout: ${userAResult?.payout} OCT`);
  console.log(`   Original bet: 2.00 OCT`);
  console.log(`   Profit: ${(parseFloat(userAResult?.payout || '0') - 2).toFixed(2)} OCT\n`);

  console.log(`✅ ${userC} (bet 2 OCT, predicted WINNER):`);
  console.log(`   Payout: ${userCResult?.payout} OCT`);
  console.log(`   Original bet: 2.00 OCT`);
  console.log(`   Profit: ${(parseFloat(userCResult?.payout || '0') - 2).toFixed(2)} OCT\n`);

  console.log(`❌ ${userB} (bet 2 OCT, predicted LOSER):`);
  console.log(`   Payout: 0.00 OCT`);
  console.log(`   Original bet: 2.00 OCT`);
  console.log(`   Loss: -2.00 OCT\n`);

  console.log('Platform revenue: ' + platformFeeOCT.toFixed(2) + ' OCT\n');

  // Verification
  const totalPayoutsMist = results.reduce(
    (sum, r) => sum + BigInt(Math.floor(parseFloat(r.payout) * 10 ** OCT_DECIMALS)),
    0n
  );
  const totalPayoutsOCT = Number(totalPayoutsMist) / (10 ** OCT_DECIMALS);

  console.log('═'.repeat(70));
  console.log('✓ VERIFICATION:\n');
  console.log(`Total pool:           ${totalPoolOCT.toFixed(2)} OCT`);
  console.log(`Platform fee:         ${platformFeeOCT.toFixed(2)} OCT (5%)`);
  console.log(`Total payouts:        ${totalPayoutsOCT.toFixed(2)} OCT`);
  console.log(`Sum (fee + payouts):  ${(platformFeeOCT + totalPayoutsOCT).toFixed(2)} OCT`);
  console.log('\n✅ Balance check: ' + 
    (Math.abs(totalPoolOCT - (platformFeeOCT + totalPayoutsOCT)) < 0.01 ? 'PASS ✓' : 'FAIL ✗'));
  console.log('═'.repeat(70) + '\n');
}

simulateBetting();
