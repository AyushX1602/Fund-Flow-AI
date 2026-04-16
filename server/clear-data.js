const prisma = require('./prismaClient');

async function clearData() {
  console.log('Clearing simulation data...');
  
  const edges = await prisma.fundFlowEdge.deleteMany();
  console.log(`  Deleted ${edges.count} fund flow edges`);
  
  const alerts = await prisma.alert.deleteMany();
  console.log(`  Deleted ${alerts.count} alerts`);
  
  const txns = await prisma.transaction.deleteMany();
  console.log(`  Deleted ${txns.count} transactions`);
  
  console.log('\nDone! Database cleared. Run a fresh simulation now.');
  await prisma.$disconnect();
}

clearData().catch(console.error);
