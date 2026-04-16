const p = require('./prismaClient');
p.account.findMany({ select: { accountHolder: true, muleScore: true, isFrozen: true, riskScore: true } })
  .then(a => {
    console.log('Account'.padEnd(22), 'Mule'.padStart(6), 'Frozen'.padStart(8), 'Risk'.padStart(6));
    console.log('-'.repeat(50));
    a.forEach(x => {
      console.log(
        x.accountHolder.padEnd(22),
        (x.muleScore || 0).toFixed(2).padStart(6),
        String(x.isFrozen).padStart(8),
        (x.riskScore || 0).toFixed(2).padStart(6)
      );
    });
    return p.$disconnect();
  });
