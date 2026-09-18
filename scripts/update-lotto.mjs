import { readFile, writeFile } from 'node:fs/promises';

const latestPath = new URL('../data/latest.json', import.meta.url);
const current = JSON.parse(await readFile(latestPath, 'utf8'));
let latest = current;

for (let round = current.round + 1; round <= current.round + 3; round += 1) {
  const url = `https://www.dhlottery.co.kr/lt645/selectPstLt645Info.do?srchLtEpsd=${round}`;
  try {
    const response = await fetch(url, { headers: { accept: 'application/json' } });
    const payload = await response.json();
    const item = payload?.data?.list?.[0];
    const numbers = [item?.tm1WnNo, item?.tm2WnNo, item?.tm3WnNo, item?.tm4WnNo, item?.tm5WnNo, item?.tm6WnNo];
    if (!item || !numbers.every(Number.isInteger) || !Number.isInteger(item.bnsWnNo)) continue;
    latest = {
      round: item.ltEpsd,
      date: `${String(item.ltRflYmd).slice(0, 4)}-${String(item.ltRflYmd).slice(4, 6)}-${String(item.ltRflYmd).slice(6, 8)}`,
      numbers,
      bonus: item.bnsWnNo,
      firstPrizeTotal: item.rnk1SumWnAmt,
      firstWinners: item.rnk1WnNope,
      firstPrizePerWinner: item.rnk1WnAmt,
      source: url,
      updatedAt: new Date().toISOString()
    };
  } catch (error) {
    console.warn(`Could not fetch round ${round}: ${error.message}`);
  }
}

if (latest.round === current.round) {
  console.log(`No newer official draw after round ${current.round}.`);
  process.exit(0);
}

await writeFile(latestPath, `${JSON.stringify(latest, null, 2)}\n`);
console.log(`Updated latest result to round ${latest.round}.`);
