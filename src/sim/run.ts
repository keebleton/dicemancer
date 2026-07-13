// Entry: npm run sim [-- games seed]. Runs headless 2p and 4p sims.
// Runs under tsx (node); declare the one node global we touch instead of
// pulling @types/node into the browser-targeted tsconfig.
declare const process: { argv: string[] };

import { formatReport, simulate } from './sim';

const games = Number(process.argv[2] ?? 1000);
const seed = Number(process.argv[3] ?? 1);

for (const players of [2, 4]) {
  const startedAt = Date.now();
  const report = simulate({ games, players, seed });
  console.log(formatReport(report));
  console.log(`(${((Date.now() - startedAt) / 1000).toFixed(1)}s)`);
  console.log('');
}
