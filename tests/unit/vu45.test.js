import { FIX_TABLE } from '../../js/fix.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { assessment, totals, density, holding } from '../../js/vu45-calc.js';
const freight = { blockSystem:'three', mode:'total', force:330, axes:60, weight:1000, category:'11', grade:6 };

test('Табличные границы и исключения ВУ-45', () => {
  assert.equal(assessment(freight).speed,80);
  assert.equal(assessment({...freight,green:true}).speed,90);
  assert.equal(assessment({...freight,grade:16}).speed,undefined);
  assert.equal(assessment({...freight,force:280}).speed,undefined);
  assert.equal(assessment({...freight,force:280,exception:true,grade:12}).speed,60);
  assert.equal(assessment({...freight,category:'7',force:800,exception:true}).speed,160);
  assert.equal(assessment({...freight,category:'7',force:800,exception:true,grade:6.001}).speed,150);
  assert.equal(assessment({...freight,category:'7',force:799,exception:true}).speed,undefined);
  assert.equal(assessment({...freight,category:'8',force:1200}).speed,200);
  assert.equal(assessment({...freight,category:'6',force:800,grade:11}).speed,undefined);
  assert.equal(assessment({...freight,category:'15.5',weakest:true,grade:13}).speed,undefined);
  assert.equal(assessment({...freight,category:'15.2',axes:401}).speed,80);
  assert.equal(assessment({...freight,localNorm:35}).speed,undefined);
});
test('Группы, выключенные оси и незавершённый ввод', () => {
  const groups=[{axes:'4',rate:'8,5'},{axes:8,rate:7}];
  assert.deepEqual(totals({groups,off:4}),{force:90,axes:16});
  assert.deepEqual(totals({groups:[...groups,{axes:'',rate:7}]}),{});
  assert.equal(density(1800,200,false),52);
  assert.equal(density(1900,201,false),46);
  assert.equal(density(1800,531,false),null);
});

test('Нажатие без подсчёта требует основания и подтверждения', () => {
  const input = {
    ...freight, mode:'special', acceptedRate:'33,5', specialSource:'Тестовый документ', specialChecked:true,
    includeLoco:true, locoWeight:150, locoForce:80
  };
  assert.deepEqual(totals(input), {axes:60, force:335});
  assert.deepEqual(assessment(input), {axes:60, weight:1000, force:335, pressure:33.5, required:330});
  for (const missing of [{axes:'0'},{weight:''},{acceptedRate:'-3'},{specialSource:'  '},{specialChecked:false}])
    assert.deepEqual(assessment({...input,...missing}), {});
});

test('Ручной ввод локомотива: отдельные итоги и незаполненные оси', () => {
  const d = {...freight, category:'12', includeLoco:true, locoWeight:120, locoForce:72, locoAxes:6, locoBrakeAxes:6, locoHandAxes:2};
  const r = assessment(d);
  assert.deepEqual([r.weight,r.axes,r.force],[1120,66,402]);
  for (const patch of [{locoHandAxes:''},{locoBrakeAxes:7},{locoAxes:'1.5'}])
    assert.deepEqual(assessment({...d,...patch}),{});
  assert.equal(assessment({...d,locoMethod:'rate',locoRate:12,locoForce:999}).force,402);
  assert.equal(assessment({...d,locoHandAxes:0}).force,402);
  assert.equal(assessment({...d,includeLoco:false}).axes,60);
});

test('Закрепление по разделу 7 приложения 2: границы осевой нагрузки, уклона и область применения', () => {
  const d = {...freight, weight:1000, axes:100, slope:12, multi:true};
  assert.deepEqual(holding(d,FIX_TABLE),{shoes:4, manual:10});
  assert.deepEqual(holding({...d,axes:101},FIX_TABLE),{shoes:10, manual:10});
  assert.deepEqual(holding({...d,slope:0},FIX_TABLE),{shoes:2,manual:6});
  for (const patch of [{slope:12.01},{multi:false}]) assert.deepEqual(holding({...d,...patch},FIX_TABLE),{local:true});
  assert.deepEqual(holding({...d,category:'1'},FIX_TABLE),{passenger:true});
});

// Приложение 2, таблица 2 протокола № 83. [Категория, минимум, пределы для трёх диапазонов спуска].
const minimumSpeeds = [
  ["1", 45, 105, 90, 80],
  ["2", 60, 120, 110, null],
  ["3", 68, 130, 120, null],
  ["4", 70, 150, 140, null],
  ["7", 80, 160, 150, null],
  ["9р", 50, 95, 90, 80],
  ["10", 50, 110, 100, 90],
  ["12", 38, 80, 75, 65],
  ["11", 28, 70, 70, 60],
  ["9п", 50, 90, 90, 80],
  ["13", 52, 110, 100, 90],
  ["14.2", 68, 130, 120, 100],
  ["14.1", 68, 130, 125, 115],
  ["15.3", 28, 50, 50, 50],
  ["15.4", 28, 65, 50, 50],
  ["15.5", 28, 55, 55, 50],
  ["15.6", 28, 60, 60, 55],
  ["15.7", 28, 60, 60, 55],
];

test('Точные минимумы таблицы 2, границы трёх диапазонов, отсутствие основания и недобор', () => {
  for (const [category, minimum, low, medium, steep] of minimumSpeeds) {
    const combined=category.startsWith('15.');
    for (const [grade, speed] of [[0,low],[6,low],[6.001,medium],[10,medium],[10.001,steep],[12,steep],[15,combined?null:steep],[15.001,null]]) {
      const d={...freight, category, grade, green:true, weakest:true, exception:true, force:minimum*10};
      assert.equal(assessment(d).speed ?? null,speed,category+' '+grade);
      assert.equal(assessment({...d,exception:false}).speed,undefined);
      assert.equal(assessment({...d,force:d.force-0.01}).speed,undefined);
    }
  }
});
test('Отказ ЭПТ, промежуточное нажатие, тип блокировки, состав по п. 3.4', () => {
  for (const [category,force,grade,failure,expected] of [
    ['2',680,6,true,120],['3',780,6,true,130],['4',800,6,true,150],
    ['7',950,6,true,180],['8',1200,6,true,180],['14.1',780,6,true,130],
    ['2',650,6,true,115],['7',900,6,false,190],['11',310,6,false,75],
    ['12',420,10.5,false,75],['1',590,10,false,115]
  ]) assert.equal(assessment({...freight,category,force,grade,eptFailure:failure,exception:true}).speed,expected);
  for (const blockSystem of ['semi','',undefined]) assert.equal(assessment({...freight,blockSystem}).speed,undefined);
  assert.equal(assessment({...freight,blockSystem:'four',green:true}).speed,80);
  for (const [composition,force,expected] of [[49,320,undefined],[50,320,80],[75,310,80],[100,300,85],[101,300,undefined]])
    assert.equal(assessment({...freight,composition,force,heavyAxle:true,symmetric:true,green:true}).speed,expected);
});

test('Группы с отключёнными и частично действующими тормозами', () => {
  const groups=[{axes:8,rate:9,efficiency:'partial'},{axes:4,rate:7,efficiency:'zero'}];
  assert.deepEqual(totals({groups,off:4}),{axes:16,force:48});
});
