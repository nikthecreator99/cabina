// Выдуманные данные для замеров скорости: N поездок назад от «сейчас» тестов (20.10.2026), примерно через 1,5 суток.
const pad = (n) => String(n).padStart(2, '0');
const fmt = (ms) => { const d = new Date(ms); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };

export function makeTrips(N) {
  const routes = [
    { id: 'r1', from: 'Альфа', to: 'Бета', distanceKm: 180, stations: ['Гамма', 'Дельта'] },
    { id: 'r2', from: 'Бета', to: 'Альфа', distanceKm: 180 },
  ];
  const trips = [];
  let at = Date.UTC(2026, 9, 19, 20, 0);
  for (let i = 0; i < N; i++) {
    const len = (7 + (i % 6)) * 3600e3;
    trips.push({ id: 't' + i, routeId: i % 2 ? 'r1' : 'r2', routeLabel: i % 2 ? 'Альфа → Бета' : 'Бета → Альфа', start: fmt(at - len), end: fmt(at),
      locoType: ['2ЭС5К', '3ЭС5К', 'ВЛ80С'][i % 3], locoNumber: String(100 + (i % 40)), weight: 4000 + (i % 20) * 100,
      restType: i % 2 ? 'turnaround' : 'home', homeChoice: i % 2 ? null : 'queue' });
    at -= len + (20 + (i % 9)) * 3600e3;
  }
  return { trips, routes };
}
