const p = require('./prismaClient');
async function reset() {
  // Reset all accounts to clean/safe state
  const result = await p.account.updateMany({
    data: {
      muleScore: 0.05,
      riskScore: 0.15,
      isFrozen: false,
      frozenAt: null,
      frozenReason: null,
    }
  });
  console.log(`Reset ${result.count} accounts to clean state`);
  
  // Set a few accounts with slightly higher scores for demo variety
  const accounts = await p.account.findMany({ select: { id: true, accountHolder: true } });
  
  // Make 2 accounts slightly suspicious for demo contrast
  for (const acc of accounts) {
    if (acc.accountHolder.includes('Unknown User 1')) {
      await p.account.update({ where: { id: acc.id }, data: { muleScore: 0.35, riskScore: 0.40 } });
      console.log(`  ${acc.accountHolder}: mule=0.35 (slightly elevated)`);
    }
    if (acc.accountHolder.includes('Unknown User 3')) {
      await p.account.update({ where: { id: acc.id }, data: { muleScore: 0.55, riskScore: 0.60 } });
      console.log(`  ${acc.accountHolder}: mule=0.55 (suspicious - for demo)`);
    }
  }
  
  console.log('\nAll other accounts: mule=0.05, risk=0.15, frozen=false');
  console.log('Now legitimate transactions will score LOW as expected.');
  await p.$disconnect();
}
reset().catch(console.error);
