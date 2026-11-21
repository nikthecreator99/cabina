import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parsePayslip} from '../../js/payslip-parse.js';
import {auditPayslip} from '../../js/payslip-report.js';

const sample=[
  'Расчетный листок за май месяц 2025 года','Оклад/Тариф 200,00',
  'май Оплата 004L 20,00/ 4.000,00 май Аванс 880А 500,00',
  'апрель Премия 011L 50,00 май Удержанный 883A 592,00','апрель Премия 011L 50,00',
  'Всего начислено 4.100,00','Доходы в натуральной форме Всего удержано и перечислено 1.092,00',
  'май Билет 374P 450,00 К выплате через кассу 0,00','К перечислению через банк 3.008,00',
  'Всего доходов в натуральной форме 450,00','Справочно НДФЛ','Доход 4.550,00 10.000,00',
  'Доход, облагаемый НДФЛ 4.550,00 10.000,00','Основная налоговая база 13% 4.550,00 10.000,00',
  'Налог на доходы физич. лиц 13% исчисл. 592,00 1.300,00','Налог на доходы физич. лиц 13% удерж. 592,00 1.300,00',
].join('\n');
test('ФТУ-69 — две колонки, повторные премии и натуральный доход отдельно от выплаты',()=>{
  const s=parsePayslip(sample),{checks,items}=auditPayslip(s);
  assert.equal(s.unread,0);assert.equal(s.rows.length,6);
  assert.equal(items.filter(x=>x.code==='011L').length,2);assert.equal(items.find(x=>x.code==='004L').status,'ok');
  assert.equal(checks.find(x=>x.title==='К перечислению через банк').status,'ok');
  assert.equal(checks.find(x=>x.title==='Сумма строк начислений').status,'ok');
  assert.match(checks.find(x=>x.title==='Проезд за счёт работодателя').detail,/58,50/);
  assert.equal(s.taxes[0].base,4550);
});
test('расхождение, недостающий итог, отрицательные и неизвестные строки',()=>{
  const s=parsePayslip(sample.replace('4.000,00','3.999,80').replace('К выплате через кассу 0,00',''));
  const {checks}=auditPayslip(s);
  assert.equal(checks.find(c=>c.title==='Сумма строк начислений').status,'diff');
  assert.equal(checks.find(c=>c.title==='К перечислению через банк').status,'unknown');
  const partial=parsePayslip('май Поправка 755Х -35,43\nмай Неразборчиво\nмай НетСуммы 004L 20,00/');
  assert.equal(partial.rows[0].amount,-35.43);assert.equal(auditPayslip(partial).items[0].status,'unknown');assert.equal(partial.unread,2);
  assert.throws(()=>parsePayslip(sample+'\nРасчетный листок за март месяц 2025 года'));
});
