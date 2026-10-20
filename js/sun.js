// Восход и закат по координатам города выбранного часового пояса (алгоритм NOAA, точность ~1–2 мин).
const CITY = {
  'Europe/Kaliningrad': [54.71, 20.51], 'Europe/Moscow': [55.75, 37.62], 'Europe/Samara': [53.2, 50.15],
  'Asia/Yekaterinburg': [56.84, 60.6], 'Asia/Omsk': [54.99, 73.37], 'Asia/Krasnoyarsk': [56.01, 92.87],
  'Asia/Novosibirsk': [55.03, 82.92], 'Asia/Irkutsk': [52.29, 104.3], 'Asia/Yakutsk': [62.03, 129.73],
  'Asia/Chita': [52.03, 113.5], 'Asia/Vladivostok': [43.12, 131.89], 'Asia/Magadan': [59.56, 150.8],
  'Asia/Kamchatka': [53.02, 158.65],
};

export function coordsForTz(tz) {
  let key = tz;
  if (!tz || tz === 'auto') { try { key = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { key = ''; } }
  return CITY[key] || CITY['Europe/Moscow'];
}

const rad = Math.PI / 180;

// Возвращает { rise, set } — моменты (мс, UTC) для суток, содержащих nowMs; polar: 'day' | 'night' | null
export function sunTimes(nowMs, lat, lon) {
  const J = nowMs / 86400000 + 2440587.5;
  const n = Math.round(J - 2451545.0 - 0.0009 + lon / 360) ;
  const Jstar = n + 0.0009 - lon / 360;
  const M = (357.5291 + 0.98560028 * Jstar) % 360;
  const C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 0.0003 * Math.sin(3 * M * rad);
  const L = (M + C + 180 + 102.9372) % 360;
  const Jtransit = 2451545.0 + Jstar + 0.0053 * Math.sin(M * rad) - 0.0069 * Math.sin(2 * L * rad);
  const sinD = Math.sin(L * rad) * Math.sin(23.4397 * rad);
  const cosD = Math.cos(Math.asin(sinD));
  const cosW = (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * sinD) / (Math.cos(lat * rad) * cosD);
  const toMs = (jd) => (jd - 2440587.5) * 86400000;
  if (cosW > 1) return { polar: 'night', noon: toMs(Jtransit) };
  if (cosW < -1) return { polar: 'day', noon: toMs(Jtransit) };
  const w = Math.acos(cosW) / rad;
  return { rise: toMs(Jtransit - w / 360), set: toMs(Jtransit + w / 360), noon: toMs(Jtransit), polar: null };
}

// Фаза неба: 'sunrise' | 'day' | 'sunset' | 'night'
export function skyPhase(nowMs, tz) {
  const [lat, lon] = coordsForTz(tz);
  const t = sunTimes(nowMs, lat, lon);
  if (t.polar === 'day') return 'day';
  if (t.polar === 'night') return 'night';
  const MIN = 60000;
  if (nowMs >= t.rise - 40 * MIN && nowMs < t.rise + 70 * MIN) return 'sunrise';
  if (nowMs >= t.set - 70 * MIN && nowMs < t.set + 40 * MIN) return 'sunset';
  if (nowMs >= t.rise + 70 * MIN && nowMs < t.set - 70 * MIN) return 'day';
  return 'night';
}
