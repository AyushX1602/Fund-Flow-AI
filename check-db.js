const p = require('./server/prismaClient');
async function main() {
  const recent = await p.transaction.count({ where: { timestamp: { gte: new Date(Date.now() - 24*3600*1000) } } });
  const total  = await p.transaction.count();
  const mules  = await p.account.count({ where: { muleScore: { gt: 0.5 } } });
  const highRisk = await p.account.count({ where: { riskScore: { gt: 0.5 } } });
  const latestTxn = await p.transaction.findFirst({ orderBy: { timestamp: 'desc' }, select: { timestamp: true } });
  console.log('Txns last 24h:', recent);
  console.log('Total txns:', total);
  console.log('Mule accounts (>0.5):', mules);
  console.log('High risk accounts (>0.5):', highRisk);
  console.log('Latest txn timestamp:', latestTxn?.timestamp);
  await p.$disconnect();
}
main().catch(console.error);
