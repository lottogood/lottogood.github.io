import { writeFile } from 'node:fs/promises';

const firstRound = 1190;
const lastRound = 1241;
const endpoint = round => `https://www.dhlottery.co.kr/lt645/selectPstLt645Info.do?srchLtEpsd=${round}`;

async function fetchRound(round) {
  const response = await fetch(endpoint(round), { headers: { accept: 'application/json' } });
  const item = (await response.json())?.data?.list?.[0];
  const numbers = [item?.tm1WnNo, item?.tm2WnNo, item?.tm3WnNo, item?.tm4WnNo, item?.tm5WnNo, item?.tm6WnNo];
  if (!item || !numbers.every(Number.isInteger) || !Number.isInteger(item.bnsWnNo)) throw new Error(`Invalid result for round ${round}`);
  const date = String(item.ltRflYmd);
  return { round: item.ltEpsd, date: `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`, numbers, bonus: item.bnsWnNo };
}

const rounds = Array.from({ length: lastRound - firstRound + 1 }, (_, index) => firstRound + index);
const history = [];
for (let index = 0; index < rounds.length; index += 6) {
  const batch = await Promise.all(rounds.slice(index, index + 6).map(fetchRound));
  history.push(...batch);
  console.log(`Fetched through round ${history.at(-1).round}`);
}
await writeFile(new URL('../data/history.json', import.meta.url), `${JSON.stringify(history, null, 2)}\n`);
