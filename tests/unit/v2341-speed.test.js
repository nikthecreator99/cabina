// 2.34.1 (просьба Никиты «упростить код и ускорить приложение»): «сейчас» считается один раз в минуту, а не заново
// на каждую поездку — и при этом остаётся верным, когда меняется минута или часовой пояс в настройках.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { S, nowLocal } from '../../js/store.js';
import { fmtLocal } from '../../js/calc.js';

const realNow = Date.now;
const RealFmt = Intl.DateTimeFormat;
const tz0 = S.settings.tz;
afterEach(() => { Date.now = realNow; Intl.DateTimeFormat = RealFmt; S.settings.tz = tz0; });
const at = (iso) => { const ms = Date.parse(iso); Date.now = () => ms; };

test('«сейчас» — по часовому поясу из настроек, с точностью до минуты', () => {
  S.settings.tz = 'Europe/Moscow';
  at('2026-10-20T09:00:00Z');
  assert.equal(fmtLocal(nowLocal()), '2026-10-20T12:00');
  at('2026-10-20T09:00:59Z');
  assert.equal(fmtLocal(nowLocal()), '2026-10-20T12:00');
  at('2026-10-20T09:01:00Z');
  assert.equal(fmtLocal(nowLocal()), '2026-10-20T12:01');
  at('2026-10-20T21:30:00Z');
  assert.equal(fmtLocal(nowLocal()), '2026-10-21T00:30');
});

test('сменили часовой пояс в настройках — «сейчас» сразу другое, даже в ту же минуту', () => {
  at('2026-10-20T09:00:00Z');
  S.settings.tz = 'Europe/Moscow';
  assert.equal(fmtLocal(nowLocal()), '2026-10-20T12:00');
  S.settings.tz = 'Asia/Yekaterinburg';
  assert.equal(fmtLocal(nowLocal()), '2026-10-20T14:00');
  S.settings.tz = 'Asia/Vladivostok';
  assert.equal(fmtLocal(nowLocal()), '2026-10-20T19:00');
  S.settings.tz = 'Europe/Moscow';
  assert.equal(fmtLocal(nowLocal()), '2026-10-20T12:00');
});

test('тысячи вызовов в одну минуту не создают форматтер дат заново', () => {
  let made = 0;
  Intl.DateTimeFormat = function (...a) { made++; return new RealFmt(...a); };
  S.settings.tz = 'Asia/Novosibirsk';
  at('2026-10-20T09:00:00Z');
  for (let i = 0; i < 5000; i++) nowLocal();
  at('2026-10-20T09:05:00Z');
  for (let i = 0; i < 5000; i++) nowLocal();
  assert.equal(fmtLocal(nowLocal()), '2026-10-20T16:05');
  assert.ok(made <= 1, `форматтер создан ${made} раз`);
});

test('неизвестный часовой пояс — время телефона, и ошибка не запоминается', () => {
  S.settings.tz = 'Nowhere/Nothing';
  at('2026-10-20T09:00:00Z');
  const d = new Date(Date.now());
  assert.equal(nowLocal(), Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()));
  S.settings.tz = 'Europe/Moscow';
  assert.equal(fmtLocal(nowLocal()), '2026-10-20T12:00');
});

test('обновление: про каждый файл спрашиваем сервер, но неизменённый заново не скачиваем', () => {
  const sw = readFileSync(new URL('../../sw.js', import.meta.url), 'utf8');
  assert.match(sw, /new Request\(u, \{ cache: 'no-cache' \}\)/);
  assert.doesNotMatch(sw, /force-cache|only-if-cached/); // без спроса у сервера файлы приложения не берём
  const site = readFileSync(new URL('../../server/site/cabina-site.sh', import.meta.url), 'utf8');
  assert.match(site, /cp -R --preserve=timestamps /); // время файла сохраняем, владельца — нет
  assert.doesNotMatch(site, /cp -R?p |cp -a /);
});
