import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareTrips } from '../../js/payslip-compare.js';
import { takeHome } from '../../js/payslip-report.js';

test('сверка за месяц делит ночную поездку на границе месяцев',()=>{
  const trip={start:'2026-04-30T22:00',end:'2026-05-01T07:00'};
  const entry={kind:'earnings',code:'023L',hours:6,amount:6};
  const sheet={period:'май 2026',worked:7,rows:[{...entry,month:'май'},{...entry,month:'апрель'}]};
  const compare=(s)=>compareTrips(s,'2026-05',[trip],[],{});
  const night=compare(sheet).rows.find(r=>r.title==='Ночные часы');
  assert.equal(night.status,'ok');assert.equal(night.sheet,6);
  assert.match(compare({...sheet,period:'апрель 2026'}).message,/апрель/);
  assert.equal(compare({...sheet,rows:[]}).rows.find(r=>r.title==='Ночные часы').status,'unknown');
});

test('на руки включает аванс и окончательную выплату, исключает сторонние перечисления',()=>{
  const deduction=(code,amount)=>({kind:'deductions',code,amount});
  const sheet={rows:[deduction('880A',20),deduction('880A',-2),deduction('881A',5)],deducted:23,bank:60,cash:3,gross:86};
  assert.equal(takeHome(sheet).total,81);
  assert.equal(takeHome({...sheet,unread:1}).total,null);
  assert.equal(takeHome({...sheet,cash:null}).total,null);
});
