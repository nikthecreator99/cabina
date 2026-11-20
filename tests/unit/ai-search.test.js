import test from 'node:test';
import assert from 'node:assert/strict';
import { findStage, webHits, searchTerms } from '../../server/ai/search.mjs';

const token = 'auth.test.token';
function xml(docs) {
  return Buffer.from('<yandexsearch><response>' + docs.map(url =>
    '<doc><url>' + url + '</url><title>Источник</title><passages><passage>Выдержка &amp; <hlword>пояснение</hlword></passage></passages></doc>').join('') + '</response></yandexsearch>').toString('base64');
}
test('из проверенной выдачи проходят только HTTPS-страницы согласованных доменов', () => {
  const raw = xml(['https://publication.pravo.gov.ru/one', 'https://rzd.ru.example.org', 'http://rzd.ru', 'https://rzd.ru@other.test']);
  const hits = webHits(raw, 'trusted');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].quote, 'Выдержка & пояснение');
  assert.equal(searchTerms('Скока отдыхать в оборотке?'), 'отдых в пункт оборота');
});
test('локальный этап работает без внешнего API и веб-лимита', async () => {
  const deps = { rest: async (name) => { assert.equal(name, 'ai_document_matches'); return {ok: true, data: []}; }, webEnabled: false };
  assert.deepEqual((await findStage(token, 'Отпуск?', 'documents', deps)).body, {stage:'documents', sources:[], webEnabled:false});
});
test('провайдер вызывается только после успешного резервирования, запрос обезличен', async () => {
  const deps = {webEnabled: true, rest: async () => ({ok:false, data:{message:'cabina: month limit'}})};
  assert.equal((await findStage(token, 'Отпуск?', 'trusted', deps)).body.error, 'month_limit');
  deps.rest = async () => ({ok:true, data:8});
  deps.web = async (query) => { assert.ok(!query.includes('mail.ru')); assert.ok(query.includes('site:pravo.gov.ru')); return {ok:true, data:{rawData:xml([])}}; };
  const res = await findStage(token, 'Отпуск example@mail.ru?', 'trusted', deps);
  assert.equal(res.body.webLeft, 8);
});
