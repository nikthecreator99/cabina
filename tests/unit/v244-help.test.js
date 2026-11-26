// CABINA 2.44: умная «Помощь и поддержка» — вопрос своими словами, с опечатками; подсказки при наборе; всё в телефоне.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HELP, helpAnswers, helpListHtml } from '../../js/help.js';
import { skel, wordScore, queryTerms, sureAnswer, markText } from '../../js/help-match.js';
import { esc } from '../../js/ui.js';

const ALL = { account: true, signed: true };
const top = (q, ctx = ALL) => helpAnswers(q, ctx)[0]?.it.id;
const sure = (q) => sureAnswer(helpAnswers(q, ALL))?.it.id;

test('скелет слова: как слышится, а не как написано', () => {
  assert.equal(skel('щитаеца'), skel('считается'));
  assert.equal(skel('атдых'), skel('отдых'));
  assert.equal(skel('Отдыхъ'), skel('отдых'));
  assert.equal(skel('медкомисия'), skel('медкомиссия'));
  assert.notEqual(skel('отдых'), skel('поездка'));
});

test('похожесть слов: формы слова, опечатки, начало слова при наборе', () => {
  assert.equal(wordScore(skel('отдых'), skel('отдых')), 1);
  assert.ok(wordScore(skel('считать'), skel('считается')) >= 0.75, 'другая форма');
  assert.ok(wordScore(skel('локомотив'), skel('локомотвы')) >= 0.6, 'опечатка');
  assert.ok(wordScore(skel('счит'), skel('считается'), true) >= 0.75, 'ещё печатают');
  assert.equal(wordScore(skel('абракадабра'), skel('обратно')), 0);
  assert.equal(wordScore(skel('дом'), skel('дым')), 0, 'короткие слова — без «опечаток»');
});

test('пример Никиты: «как считает…» — подсказка «Как считается полный отдых?», полный вопрос — уверенный ответ', () => {
  const typing = helpAnswers('как считает', ALL).map((r) => r.it.id);
  assert.ok(typing.includes('rest-full') && typing.includes('rest-turn'), String(typing));
  assert.equal(sure('как считается полный отдых'), 'rest-full');
  assert.equal(sure('как щитаеца полный атдых'), 'rest-full', 'с ошибками');
  assert.equal(sure('КАК СЧИТАЕТСЯ ДОМАШНИЙ ОТДЫХ'), 'rest-full', 'домашний = полный');
  assert.equal(sure('атдых в аборотном'), 'rest-turn');
});

test('разговорные слова, ошибки и лишние слова — понимает', () => {
  const cases = {
    'сверхурочка': 'hours-over', 'больняк как считается': 'abs-sick', 'отпускные': 'vacation-pay', 'медкомисия': 'abs-med',
    'потерял телефон': 'data-lost', 'как перенести на новый телефон': 'data-move', 'как удалить поездку': 'trip-edit',
    'не сохраняеться поездка': 'trip-overlap', 'шрифт мелкий': 'text-size', 'тяжеловесный поезд доплата': 'pay-heavy',
    'норма часов откуда': 'hours-norm', 'как смениь локомотив': 'trip-legs', 'здравствуйте подскажите пожалуйста где хранятся мои записи': 'data-where',
  };
  for (const [q, id] of Object.entries(cases)) assert.equal(top(q), id, `«${q}» → ${top(q)}`);
});

test('пустые и непонятные вопросы — ничего не выдумываем', () => {
  assert.deepEqual(helpAnswers('как', ALL), []);
  assert.deepEqual(helpAnswers('   ', ALL), []);
  assert.deepEqual(helpAnswers('абракадабра', ALL), []);
  assert.deepEqual(queryTerms('как мне это сделать'), []);
  assert.equal(sure('выходной'), undefined, 'одно общее слово — не «ответ», а список');
});

test('без аккаунта вопросы об аккаунте не подбираются; без входа нет кнопок на экраны аккаунта', () => {
  const noAcc = { account: false, signed: false };
  assert.ok(!helpAnswers('удалить аккаунт', noAcc).some((r) => r.it.id === 'acc-delete'));
  assert.equal(top('удалить аккаунт'), 'acc-delete');
  const out = helpListHtml('что видят коллеги', new Set(), { account: true, signed: false });
  assert.doesNotMatch(out, /data-page="privacy"/);
});

test('на экране: уверенный ответ открыт и подписан «Ответ», при наборе — «Похоже на ваш вопрос», слова подсвечены, всё экранировано', () => {
  const ans = helpListHtml('как щитаеца полный атдых', new Set(), ALL);
  assert.match(ans, /group-title">Ответ</);
  assert.match(ans, /data-id="rest-full" open data-auto="1"/);
  assert.match(ans, /<mark>считается<\/mark>[\s\S]*<mark>отдых<\/mark>/);
  const sug = helpListHtml('как считает', new Set(), ALL);
  assert.match(sug, /Похоже на ваш вопрос/);
  assert.doesNotMatch(sug, / open/);
  assert.ok((sug.match(/data-id=/g) || []).length <= 6, 'не больше шести');
  assert.equal(markText('<b>отдых</b>', 'отдых', esc), '&lt;b&gt;<mark>отдых</mark>&lt;/b&gt;');
  const all = helpListHtml('', new Set(), ALL);
  assert.match(all, /Частые вопросы/);
});

test('умный поиск ничего не отправляет и не хранит: в модуле нет сети и хранилищ', () => {
  const code = readFileSync(new URL('../../js/help-match.js', import.meta.url), 'utf8');
  assert.doesNotMatch(code, /fetch\(|XMLHttpRequest|localStorage|indexedDB|sendBeacon|import\(/);
  assert.ok(HELP.length > 5);
});
