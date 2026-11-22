// Только синтетические примеры ФТУ-69.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePayslip } from '../../js/payslip-parse.js';
import { meanBonus, summarizeBonus } from '../../js/payslip-bonus.js';
import { payCfg } from '../../js/pay.js';
import { S, forgetPayslipBonuses, loadAll, myPay, rememberPayslipBonus } from '../../js/store.js';

const read = (month, lines) => parsePayslip(['Расчетный листок за ' + month, ...lines].join('\n'));
const dec = read('декабрь 2025', [
  'декабрь Тариф 004L 10,00/ 1.000,00', 'декабрь Ночные 023L 5,00/ 40,00 200,00',
  'декабрь Районный 026A 20,00 240,00', 'декабрь Отпуск 032E / 1,00 900,00',
  'Всего начислено 2.340,00',
]);
const jan = read('январь 2026', [
  'декабрь ОбычнаяПремия 011L 108,00', 'декабрь ОбычнаяПремия 011L 6,00 66,00',
  'декабрь Коррекция 004L -1,00/ -40,00', 'декабрь РазоваяПремия 010L 80,00',
  'декабрь Экономия 248L 90,00', 'январь Тариф 004L 20,00/ 2.000,00',
  'Всего начислено 2.304,00',
]);
const feb = read('февраль 2026', ['январь ОбычнаяПремия 011L 100,00']);

test('премия: месяцы работы, несколько строк, сторно, округление, декабрь/январь и порядок загрузки', () => {
  const a = summarizeBonus(dec), b = summarizeBonus(jan), c = summarizeBonus(feb);
  assert.equal(meanBonus([b]), null);
  assert.equal(meanBonus([b, a]), 15); // 174 / (1200 − 40)
  assert.equal(meanBonus([c, b, a]), 10); // среднее 5% и 15% по месяцам
  assert.equal(meanBonus([a, b, c]), 10);
  assert.deepEqual(Object.keys(b).sort(), ['base', 'corrections', 'id', 'premiums']);
  assert.deepEqual(b.premiums, { '2025-12': { amount: 17400 } });
});

test('премия: первый однозначный процент применяется сразу, неизвестная база не заменяется доходом', () => {
  const printed = read('март 2026', ['февраль ОбычнаяПремия 011L 13,50 135,00']);
  const record = summarizeBonus(printed);
  assert.equal(meanBonus([record]), 13.5);
  const zero = read('март 2026', ['февраль ОбычнаяПремия 011L 0,00 0,00']);
  assert.equal(meanBonus([summarizeBonus(zero)]), 0);
  const ambiguous = read('март 2026', [
    'февраль ОбычнаяПремия 011L 10,00 100,00', 'февраль ОбычнаяПремия 011L 20,00 100,00'
  ]);
  assert.equal(meanBonus([summarizeBonus(ambiguous)]), null);
  const unknown = read('декабрь 2025', ['декабрь Тариф 004L 10,00/ 1.000,00', 'декабрь Неизвестное 777X 3.000,00', 'Всего начислено 4.000,00']);
  assert.equal(meanBonus([summarizeBonus(jan), summarizeBonus(unknown)]), null);
  assert.equal(summarizeBonus({ ...jan, gross: 100000 }), null);
  assert.equal(summarizeBonus({ ...jan, unread: 1 }), null);
  assert.equal(summarizeBonus({ ...jan, period: null }), null);
  assert.equal(payCfg({}).bonus, 10);
  assert.equal(payCfg({ assistant: {} }, 'assistant', 13.5).bonus, 13.5);
  assert.equal(payCfg({ assistant: { bonus: 12 } }, 'assistant', 13.5).bonus, 12);
  assert.equal(payCfg({ main: { bonus: '' } }, 'driver', 13.5).bonus, 0);
});

test('премия: повтор, исправление, перезагрузка, ручная настройка и удаление', async () => {
  await forgetPayslipBonuses();
  await rememberPayslipBonus(jan);
  await rememberPayslipBonus(dec);
  await rememberPayslipBonus(jan);
  assert.equal(S.bonusRecords.length, 2);
  assert.equal(myPay().bonus, 15);
  const fixed = read('январь 2026', ['декабрь ОбычнаяПремия 011L 120,00']);
  await rememberPayslipBonus(fixed, jan.period);
  await loadAll();
  assert.equal(S.bonusRecords.length, 2);
  assert.equal(myPay().bonus, 10);
  assert.equal(myPay().bonusFromSlips, true);
  await rememberPayslipBonus(read('февраль 2026', ['январь ОбычнаяПремия 011L 7,50 38,00']), fixed.period);
  assert.equal(myPay().bonus, 7.5);
  assert.equal(S.bonusRecords.length, 2);
  await forgetPayslipBonuses();
  await loadAll();
  assert.equal(myPay().bonus, 10);
  assert.equal(myPay().bonusFromSlips, false);
});
