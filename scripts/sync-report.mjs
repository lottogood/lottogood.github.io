import { mkdir, readFile, writeFile } from 'node:fs/promises';

const reportsDir = new URL('../data/reports/', import.meta.url);
const indexPath = new URL('../data/reports/index.json', import.meta.url);
const latestPath = new URL('../data/latest.json', import.meta.url);
const resultUrl = round => `https://www.dhlottery.co.kr/lt645/selectPstLt645Info.do?srchLtEpsd=${round}`;
const storesUrl = (round, rank) => `https://www.dhlottery.co.kr/wnprchsplcsrch/selectLtWnShp.do?srchWnShpRnk=${rank}&srchLtEpsd=${round}&srchShpLctn=`;

const prizeDefinitions = [
  ['1등', '당첨번호 6개 일치', 'rnk1WnNope', 'rnk1WnAmt', 'rnk1SumWnAmt'],
  ['2등', '당첨번호 5개 + 보너스번호 일치', 'rnk2WnNope', 'rnk2WnAmt', 'rnk2SumWnAmt'],
  ['3등', '당첨번호 5개 일치', 'rnk3WnNope', 'rnk3WnAmt', 'rnk3SumWnAmt'],
  ['4등', '당첨번호 4개 일치', 'rnk4WnNope', 'rnk4WnAmt', 'rnk4SumWnAmt'],
  ['5등', '당첨번호 3개 일치', 'rnk5WnNope', 'rnk5WnAmt', 'rnk5SumWnAmt']
];

const toDate = value => `${String(value).slice(0, 4)}-${String(value).slice(4, 6)}-${String(value).slice(6, 8)}`;
const formatWon = amount => `${Number(amount).toLocaleString('ko-KR')}원`;
const store = item => ({
  order: item.rnum,
  name: item.shpNm,
  region: item.region,
  selection: item.atmtPsvYnTxt ?? null,
  address: item.shpAddr,
  latitude: item.shpLat,
  longitude: item.shpLot,
  officialStoreId: item.ltShpId
});

async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

async function readIndex() {
  try {
    return JSON.parse(await readFile(indexPath, 'utf8'));
  } catch {
    return [];
  }
}

export async function syncReport(round) {
  const resultPayload = await fetchJson(resultUrl(round));
  const item = resultPayload?.data?.list?.[0];
  const numbers = [item?.tm1WnNo, item?.tm2WnNo, item?.tm3WnNo, item?.tm4WnNo, item?.tm5WnNo, item?.tm6WnNo];
  if (!item || !numbers.every(Number.isInteger) || !Number.isInteger(item.bnsWnNo)) {
    throw new Error(`Official result is unavailable for round ${round}.`);
  }

  const [firstStores, secondStores] = await Promise.all([1, 2].map(async rank => {
    try {
      const payload = await fetchJson(storesUrl(round, rank));
      return { state: 'complete', total: payload?.data?.total ?? 0, list: (payload?.data?.list ?? []).map(store) };
    } catch (error) {
      console.warn(`Winner stores for rank ${rank} are unavailable: ${error.message}`);
      return { state: 'pending', total: 0, list: [] };
    }
  }));

  const date = toDate(item.ltRflYmd);
  const prizes = prizeDefinitions.map(([rank, match, winnersKey, perWinnerKey, totalKey]) => ({
    rank,
    match,
    winners: item[winnersKey],
    prizePerWinner: item[perWinnerKey],
    prizeTotal: item[totalKey]
  }));
  const report = {
    round: item.ltEpsd,
    date,
    title: `로또 ${item.ltEpsd}회 당첨번호 ${numbers.join('·')}…1등 ${item.rnk1WnNope.toLocaleString('ko-KR')}명`,
    numbers,
    bonus: item.bnsWnNo,
    prizes,
    article: {
      deck: `제${item.ltEpsd}회 로또6/45 추첨 결과를 당첨번호와 등수별 당첨금, 1·2등 판매점 정보로 정리했습니다.`,
      lead: `동행복권이 발표한 제${item.ltEpsd}회 로또6/45 당첨번호는 ${numbers.join(', ')}이며, 보너스번호는 ${item.bnsWnNo}입니다.`,
      firstPrize: `이번 회차 1등은 ${item.rnk1WnNope.toLocaleString('ko-KR')}명으로, 1인당 ${formatWon(item.rnk1WnAmt)}을 받습니다. 1등 총 당첨금은 ${formatWon(item.rnk1SumWnAmt)}입니다.`,
      summary: `2등은 ${item.rnk2WnNope.toLocaleString('ko-KR')}명, 3등은 ${item.rnk3WnNope.toLocaleString('ko-KR')}명입니다. 아래 등수별 당첨금과 공식 판매점 정보를 함께 확인할 수 있습니다.`,
      stores: `공식 당첨판매점 조회 기준으로 1등 판매점은 ${firstStores.total.toLocaleString('ko-KR')}곳, 2등 판매점은 ${secondStores.total.toLocaleString('ko-KR')}곳입니다. 판매점 정보는 추후 정정될 수 있어 방문 전 공식 조회 페이지를 다시 확인해 주세요.`
    },
    stores: { first: firstStores, second: secondStores },
    sources: {
      result: resultUrl(item.ltEpsd),
      stores: `https://www.dhlottery.co.kr/wnprchsplcsrch/home`
    }
  };

  await mkdir(reportsDir, { recursive: true });
  await writeFile(new URL(`./${report.round}.json`, reportsDir), `${JSON.stringify(report, null, 2)}\n`);
  const list = await readIndex();
  const nextIndex = [
    ...list.filter(entry => entry.round !== report.round),
    {
      round: report.round,
      date: report.date,
      title: report.title,
      numbers: report.numbers,
      bonus: report.bonus,
      firstWinners: report.prizes[0].winners,
      firstPrizePerWinner: report.prizes[0].prizePerWinner,
      firstStoreCount: report.stores.first.total,
      secondStoreCount: report.stores.second.total
    }
  ].sort((a, b) => b.round - a.round);
  await writeFile(indexPath, `${JSON.stringify(nextIndex, null, 2)}\n`);
  console.log(`Synced round ${report.round} report.`);
  return report;
}

const invoked = /(?:^|[\\/])sync-report\.mjs$/.test(process.argv[1] ?? '');
if (invoked) {
  const suppliedRound = Number(process.argv[2]);
  const latest = suppliedRound ? null : JSON.parse(await readFile(latestPath, 'utf8'));
  await syncReport(suppliedRound || latest.round);
}
