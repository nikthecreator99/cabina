// Only the layout is reused across trips. Counter readings always start blank.
export const meterModes = {
  electric: ['energy', 'regen'], traction: ['energy'], diesel: ['fuel'],
};
export const meterLabels = { energy: 'Электроэнергия', regen: 'Рекуперация', fuel: 'Топливо' };
export const seriesKey = (type) => String(type || '').toUpperCase().replace(/[\s-]/g, '');

export function newMeters(type, trips) {
  const series = seriesKey(type);
  const diesel = /^(ЧМЭ|ТЭМ|\d*ТЭП?|М62|\dМ62)/.test(series);
  let count = Number(series.match(/^([1234])/)?.[1]) || (diesel ? 1 : 2);
  let mode = diesel ? 'diesel' : 'electric';
  let latest = -1;
  for (const trip of trips) {
    for (const leg of [trip, ...(trip.legs || [])]) {
      const m = leg.meters;
      if (!series || seriesKey(leg.locoType) !== series || !m?.sections?.length || !Object.hasOwn(meterModes, m.mode)) continue;
      const time = trip.updatedAt || trip.createdAt || 0;
      if (time < latest) continue;
      latest = time;
      count = m.sections.length;
      mode = m.mode;
    }
  }
  return { mode, sections: Array.from({ length: count }, () => ({})) };
}

const filled = (v) => v != null && String(v).trim() !== '';
export function meterIssues(trip) {
  const issues = [];
  for (const [i, leg] of [trip, ...(trip.legs || [])].entries()) {
    const m = leg.meters;
    for (const [j, row] of (m?.sections || []).entries()) {
      for (const field of meterModes[m.mode] || []) {
        const from = row[field + 'From'], to = row[field + 'To'];
        if (filled(from) && !filled(to)) issues.push('Локомотив ' + (i + 1) + ', секция ' + (j + 1) + ', ' + meterLabels[field].toLowerCase());
      }
    }
  }
  return issues;
}

export function regeneration(trips) {
  let total = null;
  for (const trip of trips) {
    for (const leg of [trip, ...(trip.legs || [])]) {
      if (leg.meters?.mode !== 'electric') continue;
      for (const { regenFrom, regenTo } of leg.meters.sections) {
        if (!filled(regenFrom) || !filled(regenTo)) continue;
        const delta = Number(String(regenTo).replace(',', '.')) - Number(String(regenFrom).replace(',', '.'));
        if (Number.isFinite(delta) && delta >= 0) total = (total || 0) + delta;
      }
    }
  }
  return total;
}
