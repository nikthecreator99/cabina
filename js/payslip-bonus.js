// Оценка обычной премии по времени (011). Одна запись на месяц выдачи,
// исправленный листок заменяет её целиком. Суммы хранятся в копейках.
import { months } from './payslip-parse.js';

const PREFIX = 'payslip-bonus-';
export const isBonusRecord = (id) => typeof id === 'string' && id.startsWith(PREFIX);
const workCode = /^(004|013|018|023|035|052|057|072|073|076|151|152|172|C073|E073)/;
const otherCode = /^(010|011|026|027|032|033|049|082|174|248|256|260|269|274|305|349|374|461|504|556)/;
const corePay = /^(004|018|052|072)/;
const monthKey = (year, month) => year + '-' + String(month + 1).padStart(2, '0');
const kopecks = (rows) => rows.reduce((sum, r) => sum + Math.round(r.amount * 100), 0);

export function bonusRecordId(period) {
  const [name, year] = String(period || '').split(' ');
  const month = months.indexOf(name);
  return month >= 0 && /^20\d\d$/.test(year) ? PREFIX + monthKey(year, month) : null;
}

export function summarizeBonus(sheet) {
  const id = bonusRecordId(sheet.period);
  if (!id || sheet.unread) return null;
  const earnings = sheet.rows.filter(r => r.kind === 'earnings');
  if (!earnings.every(r => Number.isFinite(r.amount))) return null;
  if (Number.isFinite(sheet.gross) && kopecks(earnings) !== Math.round(sheet.gross * 100)) return null;
  const [month, year] = sheet.period.split(' ');
  const current = earnings.filter(r => r.month === month);
  // Неизвестные виды начислений могут входить в базу. Валовой доход включает
  // отпускные, премии и районные надбавки и для подстановки не подходит.
  const hasBase = current.some(r => corePay.test(r.code)) && current.every(r => workCode.test(r.code) || otherCode.test(r.code));
  const base = hasBase ? kopecks(current.filter(r => workCode.test(r.code))) : 0;
  const corrections = {}, premiums = {};
  for (const name of new Set(earnings.map(r => r.month))) {
    const m = months.indexOf(name);
    if (m < 0) continue;
    const period = monthKey(Number(year) - (m > months.indexOf(month) ? 1 : 0), m);
    const entries = earnings.filter(r => r.month === name);
    if (name !== month) {
      const change = kopecks(entries.filter(r => workCode.test(r.code)));
      if (change) corrections[period] = change;
    }
    const rows = entries.filter(r => /^011/.test(r.code));
    if (!rows.length) continue;
    const first = rows[0];
    // Несколько разных процентов или неполный набор процентов не дают общей ставки.
    const printed = Number.isFinite(first.pct) && first.pct >= 0 && first.pct <= 300 &&
      rows.every(r => r.pct === first.pct && r.code === first.code && (first.pct ? r.amount > 0 : r.amount === 0));
    premiums[period] = { amount: kopecks(rows), ...(printed ? { pct: first.pct } : {}) };
  }
  return { id, base, premiums, corrections };
}

// Среднее по месяцам работы, а не по строкам. Базу и премию можно загружать в любом порядке.
export function meanBonus(records) {
  const bases = new Map(), corrections = new Map(), premiums = new Map();
  for (const record of records) {
    if (record.base > 0) bases.set(record.id.slice(PREFIX.length), record.base);
    for (const [month, amount] of Object.entries(record.corrections)) {
      corrections.set(month, (corrections.get(month) || 0) + amount);
    }
    for (const [month, row] of Object.entries(record.premiums)) {
      const total = premiums.get(month);
      if (total) { total.amount += row.amount; total.pct = null; }
      else premiums.set(month, { ...row });
    }
  }
  const rates = [];
  for (const [month, row] of premiums) {
    const base = bases.get(month) + (corrections.get(month) || 0);
    const pct = base > 0 ? row.amount * 100 / base : row.pct;
    if (Number.isFinite(pct) && pct >= 0 && pct <= 300) rates.push(pct);
  }
  return rates.length ? Math.round(100 * rates.reduce((a, b) => a + b, 0) / rates.length) / 100 : null;
}
