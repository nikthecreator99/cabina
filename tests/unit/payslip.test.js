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

test('Отпуска, больничный и отдельная выплата в колонке удержаний',()=>{
  const sheet=parsePayslip([
    'Расчетный листок за сентябрь месяц 2025 года',
    'октябрь Отпуск 032E / 5,00 15.000,00 сентябр Выплата 881B 12.500,00',
    'октябрь ДопОтпуск 256E / 1,00 3.000,00','ноябрь Северный 260E / 2,00 6.000,00',
    'сентябрь Учебный 033B / 4,00 10.000,00','сентябрь Пособие 305A / 2,00 2.400,00',
    'сентябрь Больничный 556W / 4,00 0,00','24 г Премия 269Z 700,00',
    'Всего начислено 37.100,00','Всего удержано и перечислено 12.500,00'
  ].join('\n'));
  const {items,checks}=auditPayslip(sheet);
  const leave=items.find(x=>x.code==='032E');
  assert.equal(leave.days,5);assert.equal(leave.pct,null);assert.equal(leave.hours,null);
  assert.equal(leave.month,'октябрь');assert.equal(leave.status,'info');
  assert.equal(items.find(x=>x.code==='881B').kind,'deductions');
  assert.equal(items.find(x=>x.code==='269Z').month,'24 г');
  assert.match(checks.find(x=>x.title.includes('дополнительных отпусков')).detail,/8 дн/);
  assert.match(checks.find(x=>x.title.includes('учебного отпуска')).detail,/4 дн/);
  assert.match(items.find(x=>x.code==='556W').detail,/СФР/);
  assert.equal(checks.find(x=>x.title==='Сумма строк начислений').status,'ok');
});
test('Знаковые перерасчёты сохраняют период и буквенный префикс кода',()=>{
  const sheet=parsePayslip(['Расчетный листок за октябрь месяц 2025 года','Оклад/Тариф 250,00',
    'сентябрь Поправка С073 -1,00/ -200,00 сентябр Взнос 902А -3,00',
    'октябрь Доплата Е073 2,00/ 500,00','октябрь Ночные 023L 2,00/ 40,00 200,00',
    'Всего начислено 500,00'].join('\n'));
  const {items,checks}=auditPayslip(sheet);
  assert.equal(sheet.unread,0);assert.equal(items[0].code,'C073');assert.equal(items[0].hours,-1);
  assert.equal(items[0].status,'unknown');assert.equal(items[1].month,'сентябрь');
  assert.equal(items[2].status,'ok');assert.equal(items[3].pct,40);
  assert.equal(checks.find(x=>x.title==='Сумма строк начислений').status,'ok');
});
