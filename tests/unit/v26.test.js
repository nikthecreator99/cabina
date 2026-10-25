// CABINA 2.6: вид движения по умолчанию, один набор ставок, поиск по поездкам, записная книжка, день календаря.
// Все данные выдуманные.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { S } from '../../js/store.js';
import { usualKind, TRIP_KINDS } from '../../js/forms.js';
import { paySet, payCfg, payMonth, tripPay } from '../../js/pay.js';
import { tripStats } from '../../js/calc.js';
import { tripHaystack, searchTrips } from '../../js/search.js';
import { normPhone, telHref, phonesListHtml } from '../../js/phones.js';
import { tripsOnDay } from '../../js/day.js';
import { backupSafe } from '../../js/backup.js';

const T = (id, start, end, extra = {}) => ({ id, start, end, passenger: [], waiting: [], ...extra });

beforeEach(() => {
  S.trips = []; S.routes = []; S.absences = []; S.notes = []; S.contacts = []; S.daysOff = [];
});

test('вид движения по умолчанию — самый частый в последних 20 поездках', () => {
  assert.equal(usualKind([]), 'freight', 'без поездок — грузовой');
  assert.ok(TRIP_KINDS.shunt, 'есть «Манёвры»');
  const trips = [
    T('a', '2026-10-01T08:00', '2026-10-01T16:00', { kind: 'shunt' }),
    T('b', '2026-10-02T08:00', '2026-10-02T16:00', { kind: 'shunt' }),
    T('c', '2026-10-03T08:00', '2026-10-03T16:00'),
  ];
  assert.equal(usualKind(trips), 'shunt');
  // поровну — берётся вид более поздней поездки
  assert.equal(usualKind([...trips, T('d', '2026-10-04T08:00', '2026-10-04T16:00')]), 'freight');
  // старше 20 последних поездок — не считаются
  const old = Array.from({ length: 30 }, (_, i) => T(`o${i}`, `2025-01-${String(i % 28 + 1).padStart(2, '0')}T08:00`, '', { kind: 'reserve' }));
  const fresh = Array.from({ length: 20 }, (_, i) => T(`f${i}`, `2026-09-${String(i + 1).padStart(2, '0')}T08:00`, ''));
  assert.equal(usualKind([...old, ...fresh]), 'freight');
});

test('манёвры оплачиваются как грузовой', () => {
  const cfg = payCfg({ main: { rates: [{ from: null, rate: 300 }] } });
  const t = T('m', '2026-10-05T20:00', '2026-10-06T04:00', { kind: 'shunt' });
  const st = tripStats(t);
  assert.equal(tripPay(t, st, cfg).gross, tripPay({ ...t, kind: 'freight' }, st, cfg).gross);
  const r = payMonth(2026, 10, [t], [], cfg, (x) => tripStats(x));
  assert.equal(r.lines.find((l) => l.key === 'reserve'), undefined, 'не резерв');
});

test('один набор ставок: main, а пока его нет — набор должности или тот, где есть ставка', () => {
  const a = { rates: [{ from: null, rate: 250 }] };
  const d = { rates: [{ from: null, rate: 400 }], klass: 10 };
  assert.deepEqual(paySet({}), {});
  assert.deepEqual(paySet(null), {});
  assert.equal(paySet({ assistant: a, driver: d }, 'driver'), d);
  assert.equal(paySet({ assistant: a, driver: {} }, 'driver'), a, 'у машиниста пусто — берём набор, где есть ставка');
  assert.equal(paySet({ assistant: {}, driver: { mode: 'avg', avgHour: 500 } }, 'assistant').avgHour, 500);
  const main = { rates: [{ from: null, rate: 300 }] };
  assert.equal(paySet({ main, assistant: a, driver: d }, 'driver'), main, 'main важнее старых наборов');
  // надбавка за класс — только машинисту
  assert.equal(payCfg({ main: { ...main, klass: 10 } }, 'assistant').klass, 0);
  assert.equal(payCfg({ main: { ...main, klass: 10 } }, 'driver').klass, 10);
});

test('поиск по поездкам: станции, локомотив, номер маршрута, вид, дата и заметка; без регистра и «ё»', () => {
  S.routes = [{ id: 'r1', from: 'Ёлкино', to: 'Сосновка' }];
  S.trips = [
    T('t1', '2026-10-14T05:40', '2026-10-14T17:10', { routeId: 'r1', locoType: '2ЭС5К', locoNumber: '355', routeNo: '1742', kind: 'shunt' }),
    T('t2', '2026-09-03T08:00', '2026-09-03T15:00', { routeLabel: 'Ольховка — Берёзово' }),
  ];
  S.notes = [{ id: 'n1', tripId: 't2', type: '', number: '', text: 'Не работает печка' }];
  const ids = (q) => searchTrips(q).map((t) => t.id);
  assert.deepEqual(ids('елкино'), ['t1']);
  assert.deepEqual(ids('2эс5к 355'), ['t1']);
  assert.deepEqual(ids('1742'), ['t1']);
  assert.deepEqual(ids('манёвры'), ['t1']);
  assert.deepEqual(ids('14 октября'), ['t1']);
  assert.deepEqual(ids('03.09'), ['t2']);
  assert.deepEqual(ids('печка'), ['t2']);
  assert.deepEqual(ids('березово'), ['t2']);
  assert.deepEqual(ids('2026'), ['t1', 't2'], 'новые сверху');
  assert.deepEqual(ids(''), []);
  assert.deepEqual(ids('нет такого'), []);
  assert.ok(tripHaystack(S.trips[0]).includes('маршрут 1742'));
});

test('записная книжка: номер чистится, ссылка для звонка — только цифры, текст экранируется', () => {
  assert.equal(normPhone(' +7 (900) 000-00-00 '), '+7 (900) 000-00-00');
  assert.equal(normPhone('8 900 <b>1</b>'), '8 900 1');
  assert.equal(normPhone('1'.repeat(40)).length, 20);
  assert.equal(telHref('+7 (900) 000-00-00'), 'tel:+79000000000');
  assert.equal(telHref('8 900 000 00 00'), 'tel:89000000000');
  assert.equal(telHref('12'), '');
  assert.equal(telHref('javascript:alert(1)'), '', 'только цифры');
  S.contacts = [
    { id: 'c1', name: 'Борис <img src=x>', who: 'Нарядчик', phone: '+7 900 000-00-01', note: '' },
    { id: 'c2', name: 'Анна', who: 'Медпункт', phone: '8 900 000 00 02', note: 'после 8:00' },
  ];
  const html = phonesListHtml();
  assert.ok(!html.includes('<img'), 'имя экранировано');
  assert.ok(html.indexOf('Анна') < html.indexOf('Борис'), 'по алфавиту');
  assert.ok(html.includes('href="tel:+79000000001"'));
  const found = phonesListHtml('медпункт');
  assert.ok(found.includes('Анна') && !found.includes('Борис'));
  assert.ok(phonesListHtml('0002').includes('Анна'), 'поиск по цифрам номера без пробелов');
  // книжка и отметки выходных попадают в резервную копию и проходят проверку
  assert.equal(backupSafe({ meta: [{ id: 'contacts', list: S.contacts }, { id: 'daysOff', list: ['2026-10-05'] }] }), true);
  assert.equal(backupSafe({ meta: [{ id: 'contacts', list: [{ id: '"><script>', name: 'x' }] }] }), false);
});

test('день календаря: поездки, рабочее время которых задевает день', () => {
  S.trips = [
    T('n', '2026-10-05T20:00', '2026-10-06T04:00'),
    T('d', '2026-10-06T10:00', '2026-10-06T18:00'),
  ];
  assert.deepEqual(tripsOnDay('2026-10-05').map((t) => t.id), ['n']);
  assert.deepEqual(tripsOnDay('2026-10-06').map((t) => t.id), ['n', 'd']);
  assert.deepEqual(tripsOnDay('2026-10-07').map((t) => t.id), []);
});
