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
      if (!series || seriesKey(leg.locoType) !== series || !Array.isArray(m?.sections) || !Object.hasOwn(meterModes, m.mode)) continue;
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

export function meterDelta(row, field) {
  const values = [row[field + 'From'], row[field + 'To']].map(v => String(v ?? '').trim().replace(',', '.'));
  if (!values.every(v => /^\d+(?:\.\d+)?$/.test(v))) return null;
  return Number(values[1]) - Number(values[0]);
}

export function meterTotals(trips) {
  const totals = { energy: null, regen: null, fuel: null };
  for (const trip of trips) {
    for (const leg of [trip, ...(trip.legs || [])]) {
      const m = leg.meters;
      for (const row of m?.sections || []) {
        for (const field of meterModes[m.mode] || []) {
          const delta = meterDelta(row, field);
          if (delta !== null && delta >= 0) totals[field] = (totals[field] ?? 0) + delta;
        }
      }
    }
  }
  return totals;
}
