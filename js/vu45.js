import { I, esc, confirmDialog, toast } from './ui.js';
import { liveTrip, legAt, nowLocal, locoLabel } from './store.js';
import { pdfFromJpegPages, deliverPdf } from './slip.js';
import { FIX_TABLE } from './fix.js';
import { allowsSeparateLoco, assessment, categories, effectiveRate, density, holding, manualLoco, number, totals } from './vu45-calc.js';

const key = 'cabina-vu45-draft';
const advisoryTitle = 'Справочная информация';
const advisory = 'Расчёт CABINA предназначен для сверки. В поездной работе руководствуйтесь официально оформленной ВУ-45 и действующими инструкциями. Разработчик не несёт ответственности за применение справочных расчётов, кроме случаев, предусмотренных законом.';
const rules = 'https://base.garant.ru/413565550/';
const wagons = [
  ['Грузовой, чугунные',7,5,3.5], ['Грузовой, композиционные',8.5,7,3.5],
  ['Рефрижераторный, чугунные',9,6,3.5], ['Рефрижераторный, композиционные',null,7,4.5],
  ['Контейнерная платформа',12.5,9.5,3.5], ['ЦНИИ-2 / ЦНИИ-3, композиционные',7,null,3.5],
  ['ЦНИИ-2 / ЦНИИ-3, чугунные',3.5,null,1.25], ['ЦНИИ-ДВЗ, чугунные',6,null,2.5],
  ['ЦНИИ-ДВЗ, композиционные',null,7,3], ['ЦНИИ-ДВЗМ, чугунные',7,null,3],
  ['ДВЗМ / 55-76 / 55-76М, композиционные',null,7,3.5], ['3ВС50 / 4ВС50 / 5ВС60, чугунные',6,4.5,3],
  ['6ВС60 / 7ВС60 и др., чугунные',7,4.5,3.5]
];
const rates = wagons.flatMap(([label,...values]) => values.flatMap((v,i) => v == null ? [] :
  [[`${label}, ${['гружёный','средний','порожний'][i]}`,v]])).concat([
  ['Изотермический / багажный, одностороннее торможение',6],['Пассажирский, тара от 53 т',10],
  ['Пассажирский, тара 48–53 т',9],['Пассажирский, тара 42–48 т',8],['Пассажирский до 20,2 м',9],
  ['Прочие пассажирские',6.5],['ТВЗ, дисковый до 120 км/ч',10],['ТВЗ, дисковый до 140 км/ч',12.5],
  ['ТВЗ, дисковый до 160 км/ч',13],['РИЦ, КЕ пассажирский',10],['РИЦ, КЕ скоростной',15],
  ['ВЛ-РИЦ, КЕ пассажирский',10],['ВЛ-РИЦ, КЕ скоростной',13],['61-4492 · до 120 км/ч, по документу',''],
  ['61-4492 · до 140 км/ч, по документу',''],['61-4492 · до 160 км/ч, по документу',''],['Рефрижераторный до 120 км/ч по спецусловиям, средний',14],['Рефрижераторный до 120 км/ч по спецусловиям, порожний',8.5]
]);
const checks = ['Закрепление локомотива','Давления включения и отключения компрессоров','Подготовка к проверке плотности',
  'Плотность питательной сети','Плотность тормозной сети','Поддержание зарядного давления','Плотность уравнительного резервуара',
  'Ликвидация сверхзарядного давления','Чувствительность к торможению','Чувствительность к отпуску',
  'Давление вспомогательного тормоза','Удержание давления в тормозных цилиндрах','Проходимость блокировочного устройства',
  'Проходимость крана машиниста','Проверка со стороны состава'];
const group = () => ({ type:'3', axes:'', rate:'8,5' });
function blank() {
  const date = new Date();
  date.setMinutes(date.getMinutes()-date.getTimezoneOffset());
  const trip = liveTrip(), leg = trip && legAt(trip,nowLocal());
  return { loco: leg ? locoLabel(leg.locoType,leg.locoNumber) : '', weight:leg?.weight || '', axes:leg?.axles || '', category:'11', grade:'', mode:'groups', groups:[group()], enRoute:[], slope:'', date:date.toISOString().slice(0,16), checked:[], multi:false };
}
let d;
const fmt = n => Number.isFinite(n) ? n.toLocaleString('ru-RU',{maximumFractionDigits:3}) : '—';
const val = k => esc(d[k] || '');
function field(k,label,mode='decimal') {
  const attr = mode === 'datetime-local' ? 'type="datetime-local"' : `type="text" inputmode="${mode}"`;
  return `<label>${label}<input class="input" ${attr} data-field="${k}" value="${val(k)}" autocomplete="off"></label>`;
}
const options = (rows, value) => rows.map(([k,name]) => `<option value="${esc(k)}" ${String(k)===String(value)?'selected':''}>${esc(name)}</option>`).join('');
const select = (k,label,rows) => `<label>${label}<select class="input" data-field="${k}">${options(rows,d[k])}</select></label>`;
const tick = (k,label) => `<label class="vu-tick"><input type="checkbox" data-field="${k}" ${d[k]?'checked':''}>${label}</label>`;
const sections = new Set();
const referenceMemo = `<p>Октябрьская дорога, 2018 г. Ориентиры для чтения старых справок. Применимость для конкретного поезда проверяют по приложению владельца инфраструктуры.</p>
  <p>Примеры веса пассажиров с ручной кладью на вагон: СВ на 20 мест — 2 тс, купейный — 4 тс, плацкартный — 6 тс, межобластной — 7 тс. Для двухэтажного 61-4492 на 60 и 104 места — 6,1 и 10,5 тс соответственно.</p>
  <p>Ориентиры тары, тс: четырёхосный полувагон 21–26, крытый вагон 22–27, платформа 21–27, четырёхосная цистерна 21–27. Вес для расчёта берут из поездных документов.</p>`;
const sectionIcons = {train:I.train,brakes:I.chart,special:I.gear,hand:I.shoe,measure:I.clock,route:I.route,norm:I.book,checks:I.check};
const block = (id,label,content) => `<details class="panel" data-section="${id}" ${sections.has(id)?'open':''}><summary><span class="vu-symbol" aria-hidden="true">${sectionIcons[id]}</span><span>${label}</span><span class="vu-chevron" aria-hidden="true">${I.down}</span></summary><div class="vu-fields">${content}</div></details>`;
const modes = [['total','Из справки (итоги)'],['groups','По вагонам (расчёт)'],['special','Без подсчёта по вагонам']];
function modeButtons() {
  return `<div class="vu-modes" role="group" aria-label="Способ ввода">${modes.map(([k,name])=>
    `<button type="button" class="btn" data-vu="mode" data-mode="${k}" aria-pressed="${k===d.mode}">${name}</button>`).join('')}</div>`;
}
function specialFields() {
  return field('axes','Всего осей','numeric')+
    select('specialPreset','Вариант из справки',[['','Ввести нажатие вручную'],['passenger','Пассажирский · 60 тс на 100 тс'],['metro','Сплотка вагонов метрополитена · 33 тс на 100 тс'],['loaded','Грузовой гружёный · 30 тс на 100 тс']])+
    field('specialSource','Документ и пункт, по которому принято нажатие','text')+
    field('acceptedRate','Принятое по документу нажатие, тс на 100 тс')+
    tick('specialChecked','Все тормоза включены и исправны, условия указанного пункта для состава и скорости проверены')+
    '<p class="hint">В этом режиме расчёт переводит введённое удельное нажатие в тс. Скорость устанавливают отдельно.</p>';
}
function groupRows() {
  return d.groups.map((g,i) => `<div class="vu-group" data-group="${i}"><label>Тип и режим<select data-col="type" class="input">${options(rates.map(([label,n],j)=>[j,n===''?label:label+' · '+fmt(n)]),g.type)}</select></label>
    <div class="two">${['axes','rate'].map((k,j)=>`<label>${['Осей','тс на ось'][j]}<input class="input" data-col="${k}" inputmode="${j?'decimal':'numeric'}" value="${esc(g[k])}"></label>`).join('')}</div>
    <label>Учитываемая эффективность<select class="input" data-col="efficiency">${options([['full','Полная'],['partial','Две трети по результатам проверки'],['zero','Нажатие не учитывается']],g.efficiency||'full')}</select></label>
    <button type="button" class="btn" data-vu="remove">Убрать группу</button></div>`).join('');
}
const profiles = [
  ['normal','5,0–5,2 · пассажирский или средний режим',5,5.2],
  ['loaded','5,3–5,5 · гружёный режим',5.3,5.5],['empty','4,8–5,0 · порожний или ступенчатый отпуск',4.8,5],
  ['inactive','4,5–4,8 · недействующие электропоезда и метро',4.5,4.8],['emu','4,8 · грузовой с вагонами МВПС',4.8,4.8]
];
const passengerCategories = ['1','2','3','4','5','6','7','8'];
function measurements() {
  const freight = d.freight && !passengerCategories.includes(d.category) && d.category!=='12';
  const {axes} = totals(d), vals = [];
  const head=number(d.head), tail=number(d.tail), second=number(d.second), fourth=number(d.fourth);
  if (head != null && tail != null && axes > 0 && freight) {
    const limit=axes<=300?0.3:axes<=400?0.5:0.7;
    if (tail>head) vals.push('Давление в хвосте выше давления в голове. Проверьте исходные замеры.');
    else
    vals.push(`Перепад ${fmt(Math.abs(head-tail))} кгс/см² · предел ${fmt(limit)} · ${Math.abs(head-tail)>limit+1e-9?'превышен':'в пределах'}`);
  }
  const profile = profiles.find(([k])=>k===d.profile);
  if (profile && head!=null) vals.push(`Давление в голове · ${head>=profile[2] && head<=profile[3]?'в пределах':'вне диапазона'} ${fmt(profile[2])}–${fmt(profile[3])} кгс/см²`);
  if (passengerCategories.includes(d.category)) {
    for (const [k,limit,name] of [['drop',0.2,'Тормозная сеть'],['supply',0.5,'Питательная сеть']]) {
      const value=number(d[k]);
      if (value!=null) vals.push(`${name} · падение за 60 с ${fmt(value)} кгс/см² · ${value<=limit?'в пределах':'выше предела'} ${fmt(limit)}`);
    }
    const volts=number(d.volts);
    if (volts!=null) vals.push(`Напряжение ЭПТ · ${volts>30?'выше 30 В':'30 В или ниже'}`);
  }
  const time=freight ? (d.joinedReservoirs ? number(d.joinedMinimum) : density(number(d.volume),axes,d.high)) : null;
  if (freight && d.joinedReservoirs && !(time > 0)) vals.push('Для СМЕ укажите норму времени с учётом объединённого объёма по примечанию 2 к таблице 4.');
  if (time > 0) vals.push(`Плотность во II положении · минимум ${fmt(time)} с${second==null?'':second>=time?' · выдержан':' · ниже нормы'}`);
  if (freight && axes>100 && second>0 && fourth!=null) vals.push(`IV положение · ${fourth >= second*0.9?'в пределах':'снижение более 10 %'}`);
  return vals.join('<br>');
}
function hand() {
  const r=holding(d,FIX_TABLE);
  if (r.passenger) return 'Для пассажирского состава Правила предусматривают стояночные тормоза всех вагонов. Дополнительные башмаки — с учётом местных условий.';
  if (r.local) return 'Требуемое количество устанавливает владелец инфраструктуры. Укажите его в полях этого раздела по действующему местному документу.';
  if (r.manual==null) return 'Для расчёта нужны вес и оси вагонов, табличный уклон и условия следования.';
  const have=number(d.manual,true);
  return `Приложение 2, раздел 7, таблица 4. При закреплении только башмаками: ${r.shoes}. Требуется ручных тормозных осей: ${r.manual}.${have==null?'':` Недостаёт: ${Math.max(0,r.manual-have)}.`}`;
}
function result() {
  const r=assessment(d);
  if (d.mode==='special' && r.pressure==null) return 'Укажите вес, оси, принятое нажатие и основание для расчёта без подсчёта по вагонам.';
  if (d.includeLoco && d.mode!=='special' && !manualLoco(d)) return 'Проверьте данные локомотива в разделе «Особые случаи»: вес, нажатие и число осей.';
  if (r.pressure==null) return 'Введите вес, число осей и тормозное нажатие.';
  if (d.mode==='special') return `Принято без подсчёта: ${fmt(r.pressure)} тс на 100 тс. Расчётное нажатие ${fmt(r.force)} тс. Потребное по выбранной норме ${fmt(r.required)} тс. Скорость устанавливают отдельно.`;
  const given=number(d.given);
  const status=r.force>=r.required?'Нажатие по выбранной норме обеспечено':'Нажатие ниже выбранной нормы';
  const difference=given == null?'':`<br>Расхождение с требуемым в справке: ${fmt(given-r.required)} тс`;
  return `<b>${status}</b><br><strong>${fmt(r.pressure)} тс на 100 тс</strong><br>Требуемое нажатие ${fmt(r.required)} тс · фактическое ${fmt(r.force)} тс${difference}<br>${r.speed ? `Скорость по выбранной строке таблицы: ${r.speed} км/ч` : 'Скорость не определена. Проверьте категорию, спуск, блокировку и местные условия.'}`;
}
const enRouteFields = [
  ['place','Станция или место опробования','text'], ['kind','Вид опробования','text'],
  ['weight','Вес поезда, тс','decimal'], ['axes','Всего осей','numeric'],
  ['required','Требуемое нажатие, тс','decimal'], ['actual','Фактическое нажатие, тс','decimal'],
  ['name','Фамилия для подписи','text']
];
function routeEditor() {
  return d.enRoute.map((entry,i) => `<div class="vu-group" data-entry="${i}">${enRouteFields.map(([k,label,mode]) =>
    `<label>${label}<input class="input" inputmode="${mode}" data-route="${k}" value="${esc(entry[k] ?? '')}"></label>`).join('')}
    <button class="btn" data-vu="remove-entry">Убрать отметку</button></div>`).join('')+
    '<button class="btn" data-vu="add-entry">Добавить отметку</button>';
}
function reversePaper() {
  const entries = [...d.enRoute];
  while (entries.length < 4) entries.push({});
  return `<section class="vu-reverse"><small>Форма ВУ-45 · оборотная сторона · черновик для сверки</small><p><b>${advisoryTitle}.</b> ${advisory}</p>
    <h3>Отметка о производстве опробования тормозов в пути следования</h3>
    <p>Вес, оси и нажатие заполняют при изменении состава и веса поезда.</p>
    <table><thead><tr>${enRouteFields.map(([k,label])=>`<th>${k==='name'?'Подпись':label}</th>`).join('')}</tr></thead>
    <tbody>${entries.map(entry=>`<tr>${enRouteFields.map(([k])=>`<td>${esc(entry[k] ?? '')}${k==='name'?' __________':''}</td>`).join('')}</tr>`).join('')}</tbody></table></section>`;
}
function paper() {
  const r=assessment(d), t=totals(d), hold=holding(d,FIX_TABLE);
  const separate = d.includeLoco && d.mode!=='special';
  const rows=new Map([1.25,3,3.5,4.5,5,5.5,6,6.5,7,7.5,8,8.5,9,9.5,10,11,11.5,12,12.5,13,14,15,16,18,19,21].map(x=>[x,0]));
  if (d.mode==='groups') for (const g of d.groups) {
    const n=number(g.axes,true), rate=effectiveRate(g);
    if(n>0 && rate>0) rows.set(rate,(rows.get(rate)||0)+n);
  }
  const other = new Map([[3.5,'ТЦПВ '+val('stroke')],[5,'ВСТР '+val('meeting')],[6,'ДПВ '+val('tail')],[7,'ВО2ХВ '+val('release')]]);
  return `<section><small>Форма ВУ-45 · черновик для сверки</small><h2>Справка</h2><p>Об обеспечении поезда тормозами и исправном их действии</p><p><b>${advisoryTitle}.</b> ${advisory}</p>
    <p>Железнодорожная администрация ${val('administration')}<br>Штемпель станции ${val('station')} · ${val('date').replace('T',' ')}<br>Локомотив ${val('loco')} · Поезд № ${val('train')}<br>Вес ${fmt(separate?r.weight:r.weight ?? number(d.weight))} тс · всего осей ${fmt(separate?r.axes:t.axes)}</p>
    ${separate ? `<p>Данные локомотива: вес ${val('locoWeight')} тс, суммарное нажатие ${fmt(manualLoco(d)?.force)} тс. Всего осей ${val('locoAxes')}, автотормозных ${val('locoBrakeAxes')}, ручного тормоза ${val('locoHandAxes')}.</p>` : ''}
    <p>Требуемое нажатие ${fmt(r.required)} тс${d.mode==='special' && r.force!=null?`<br>Принято без подсчёта: ${val('acceptedRate')} тс на 100 тс. Основание: ${val('specialSource')}`:''}</p>
    <table><thead><tr><th>тс/ось</th><th>Осей</th><th>Нажатие, тс</th><th>Другие данные</th></tr></thead><tbody>${Array.from(rows).sort(([a],[b])=>a-b).map(([p,n],i)=>`<tr><td>${fmt(p)}</td><td>${n||''}</td><td>${n?fmt(n*p):''}</td><td>${other.get(p) || ''}</td></tr>`).join('')}</tbody><tfoot><tr><th>Всего</th><th>${fmt(separate?r.axes:t.axes)}</th><th>${fmt(d.mode==='special'?r.required:separate?r.force:r.force ?? t.force)}</th><th></th></tr></tfoot></table>
    <p>Ручных тормозных осей ${val('manual')}<br>Потребное по действующей норме: ручных осей ${hold.manual==null?val('requiredHand'):fmt(hold.manual)}, башмаков ${hold.shoes==null?val('requiredShoes'):fmt(hold.shoes)}<br>Плотность II / IV ${val('second')} / ${val('fourth')} с<br>Давление в голове / хвосте ${val('head')} / ${val('tail')} кгс/см²<br>Отпуск хвоста ${val('release')} с<br>Плотность питательной сети ${val('supply')}<br>Напряжение в хвосте ${val('volts')} В<br>Хвостовой вагон № ${val('tailNo')} · выход штока ${val('stroke')} мм<br>Вагон встречи ${val('meeting')} · К ${val('composition')}%<br>${val('additional')}</p><p>Подпись __________ &nbsp; Фамилия ${val('inspector')}</p></section>${reversePaper()}`;
}
function checklist() {
  const details = [
    'Отметка о закреплении до проверки плотности. Правила, п. 3.2.7.',
    'Пределы включения и отключения возьмите из руководства для серии локомотива. Допуск по п. 3.2.3 составляет 0,02 МПа.',
    'Условия измерения плотности зависят от исполнения крана машиниста. Основание — п. 3.2.7.',
    'Для питательной сети исходное давление 8,0 кгс/см². За 150 с допустимо снижение до 0,2 кгс/см² (п. 3.2.7).',
    'Для тормозной сети при нормальном зарядном давлении предел снижения за 60 с составляет 0,2 кгс/см² (п. 3.2.7).',
    'Сверьте поддержание давления в поездном положении с п. 3.2.12.',
    'В перекрыше с питанием за 180 с снижение до 0,1 кгс/см². Рост давления недопустим (п. 3.2.9).',
    'Контрольный интервал в УР — от 5,8 до 5,6 кгс/см². Обычный диапазон 80–120 с, для поездов повышенной длины 100–120 с (п. 3.2.8).',
    'Условия проверки чувствительности зависят от схемы и режима воздухораспределителя, см. п. 3.2.20.',
    'Проверьте отпуск по состоянию штоков и колодок согласно п. 3.2.20.',
    'Минимальное давление в ТЦ берётся из руководства конкретной серии (п. 3.2.16).',
    'Для проверки по п. 3.2.17 предел снижения в ТЦ за 60 с — 0,2 кгс/см².',
    'Расчёт для введённого объёма ГР показан выше. Условия измерения — п. 3.2.15.',
    'Для крана применяется отдельный интервал по п. 3.2.14. Сверьте объём ГР с выпиской на локомотиве.',
    'Зафиксируйте результат проверки для фактического состава по применимому пункту раздела 9.'
  ];
  return checks.map((name,i)=>`<label class="vu-tick"><input type="checkbox" data-check="${i}" ${d.checked.includes(i)?'checked':''}>${i+1}. ${name}</label><small>${details[i]}</small>`).join('');
}
function times() {
  const volume=number(d.testVolume);
  if (!(volume>=1000)) return '';
  return `При ${fmt(volume)} л · блокировка ${fmt(9*volume/1000)}–${fmt(12*volume/1000)} с · кран ${fmt(16*volume/1000)}–${fmt(20*volume/1000)} с (пп. 3.2.14–15).`;
}
export function renderVu45() {
  if(!d) {
    d=blank();
    try {
      const saved=JSON.parse(localStorage.getItem(key));
      if(saved && Array.isArray(saved.groups) && saved.groups.every(g=>g && typeof g==='object') && Array.isArray(saved.checked)) Object.assign(d,saved);
    } catch {}
    if (d.series && String(d.series)===String(d.testVolume)) { d.testVolume=''; delete d.series; }
    if (!allowsSeparateLoco(d.category)) d.includeLoco=false;
  }
  return `<div class="page-head"><button class="icon-btn" data-act="extra-back" aria-label="Назад">${I.left}</button><h1>ВУ-45</h1></div><div class="vu" id="vu45">
    <aside class="panel vu-advisory"><strong>${advisoryTitle}</strong><p>${advisory}</p></aside><section class="panel vu-result"><h2>Тормозное нажатие</h2><div id="vu-result" aria-live="polite">${result()}</div></section>${field('loco','Локомотив, серия и номер','text')}
    ${block('train','Поезд',select('category','Категория',categories.map(([k,n])=>[k,n]))+field('grade','Руководящий спуск, ‰')+(passengerCategories.includes(d.category)?'':select('blockSystem','Блокировка на участке',[['','Выбрать'],['three','Трёхзначная АБ'],['four','Четырёхзначная АБ'],['semi','Полуавтоматическая блокировка']]))+tick('eptFailure','Отказ ЭПТ в пути следования')+tick('green','Трёхзначная АБ, зелёный АЛСН, соблюдены условия ограждения')+tick('exception','Для сниженного нажатия применим п. 4.2 или 4.3 Норм')+(d.category.startsWith('15.') && Number(d.category.slice(3))>=3?tick('weakest','Проверен каждый состав, введены данные определяющего состава'):'')+field('train','Поезд №','text')+field('administration','Железнодорожная администрация','text')+field('station','Станция','text')+field('date','Дата и время','datetime-local'))}
    ${block('brakes','Вес и тормозное нажатие',modeButtons()+field('weight',d.mode==='special'?'Вес для расчёта по выбранному документу, тс':d.includeLoco?'Вес вагонов без локомотива, тс':allowsSeparateLoco(d.category)?'Вес поезда с учётом локомотива, тс':'Вес состава, тс')+
      (d.mode==='special'?specialFields():d.mode==='total'?field('axes',d.includeLoco?'Всего осей вагонов без локомотива':'Всего осей','numeric')+field('force',d.includeLoco?'Нажатие вагонов без локомотива, тс':'Фактическое нажатие, тс'):
      '<p>Нажатие на ось можно ввести с трафарета или по документу владельца. Для композиционных колодок пассажирских вагонов по строкам 1–3 таблицы 3 учтите поправку по примечанию 4.</p>'+groupRows()+'<button class="btn" data-vu="add">＋ Группа вагонов</button>'+field('off','Осей с выключенным тормозом','numeric'))+
      field('given','Требуемое нажатие из справки для сверки, тс'))}
    ${block('special','Особые случаи',field('localNorm','Местная норма, тс на 100 тс (если установлена)')+
      (d.category==='11' && d.mode!=='special'?tick('heavyAxle','Пункт 3.4: гружёный поезд, есть нагрузка свыше 21 тс на ось, все автотормоза включены, у учитываемых вагонов с композиционными колодками включён средний режим')+tick('symmetric','В составе отсутствуют вагоны с несимметричной тормозной рычажной передачей')+'<p>Долю вагонов с композиционными колодками укажите в разделе замеров.</p>':'')+
      (d.mode==='special'?'<p>Вес и нажатие для расчёта без подсчёта укажите в разделе «Вес и тормозное нажатие».</p>':allowsSeparateLoco(d.category)?tick('includeLoco','Учесть локомотив отдельно')+(d.includeLoco?'':'<p>Если локомотив входит в расчёт по документу, введите итоговые данные с его учётом или заполните его параметры отдельно.</p>'):'<p>Для этой категории вводите данные состава без локомотива.</p>')+
      (d.includeLoco && d.mode!=='special'?field('locoWeight','Учётный вес локомотива, тс')+select('locoMethod','Как задано нажатие локомотива',[['total','Суммарное'],['rate','На автотормозную ось']])+(d.locoMethod==='rate'?field('locoRate','Нажатие на одну автотормозную ось, тс'):field('locoForce','Суммарное нажатие локомотива, тс'))+field('locoAxes','Всего осей локомотива','numeric')+field('locoBrakeAxes','Автотормозных осей локомотива','numeric')+field('locoHandAxes','Осей ручного тормоза локомотива','numeric'):''))}
    ${block('hand','Ручные тормоза и башмаки',select('slope','Уклон пути, ‰',[['','Выбрать'],...FIX_TABLE.map(([x])=>[x,String(x)])])+tick('multi','Следование по нескольким дорогам')+field('manual','Исправных ручных тормозных осей','numeric')+field('requiredHand','Требуется ручных осей по действующей норме','numeric')+field('requiredShoes','Требуется башмаков по действующей норме','numeric')+'<p id="vu-hand">'+hand()+'</p>')}
    ${block('measure','Опробование · замеры',select('profile','Профиль зарядного давления',[['','Выберите профиль'],...profiles])+(passengerCategories.includes(d.category) || d.category==='12'?'':tick('freight','Грузовой, локомотивы в голове · применить таблицу 4'))+field('head','Давление в голове, кгс/см²')+field('tail','Давление в хвосте, кгс/см²')+field('volume','Объём ГР по выписке, л')+(passengerCategories.includes(d.category) || d.category==='12'?'':tick('joinedReservoirs','СМЕ с объединёнными главными резервуарами')+(d.joinedReservoirs?field('joinedMinimum','Норма времени для СМЕ с учётом объединённого объёма и зарядного давления, с'):''))+tick('high','Зарядное давление 5,3–5,6 кгс/см²')+field('second','Плотность, II положение, с')+field('fourth','Плотность, IV положение, с')+field('release','Время отпуска хвоста, с')+field('tailNo','Хвостовой вагон №','text')+field('drop','Падение давления ТМ за 60 с, кгс/см²')+field('supply','Падение давления питательной сети за 60 с, кгс/см²')+field('stroke','Выход штока хвостового вагона, мм','text')+field('meeting','Вагон встречи осмотрщиков','text')+field('composition','Вагонов с композиционными колодками, %')+field('additional','Другие данные','text')+field('volts','Напряжение в хвосте, В')+field('inspector','Фамилия осмотрщика','text')+'<p id="vu-measures">'+measurements()+'</p>')}
    ${block('route','Опробование в пути следования',routeEditor())}
    ${block('norm','Справка из памятки · Октябрьская дорога, 2018',referenceMemo+`<a href="${rules}" target="_blank" rel="noopener">Правила · протокол № 83, приложение 65</a><p>Расчёт скорости относится к указанной категории, исправному типу тормоза и выбранному спуску. Учитывайте местные ограничения и условия применения строки.</p>`)}
    <div class="vu-actions"><button class="btn btn-primary" data-vu="pdf">${I.pdf} Справка в PDF</button><button class="btn" data-vu="copy">Скопировать</button><button class="btn" data-vu="reset">Новый поезд</button></div><article class="vu-paper" id="vu-paper">${paper()}</article>
    ${block('checks',`Контрольная проверка тормозов · <span id="vu-count">${d.checked.length}</span> из 15`,field('testVolume','Объём ГР по выписке на локомотиве, л')+'<p id="vu-times">'+times()+'</p>'+checklist()+'<button class="btn" data-vu="clear-checks">Сбросить отметки проверки</button>')}</div>`;
}
function save() {
  try { localStorage.setItem(key,JSON.stringify(d)); } catch { toast('Черновик доступен до закрытия приложения'); }
}
async function renderPaperSide(side) {
  // Use the same rows and field values as the on-screen certificate.
  const page = document.createElement('canvas');
  page.width = 1240;
  page.height = 1754;
  const ctx = page.getContext('2d');
  ctx.fillStyle = 'white';
  ctx.fillRect(0,0,page.width,page.height);
  ctx.fillStyle = '#17202a';
  ctx.strokeStyle = '#89939c';
  const margin=64, width=page.width-2*margin;
  let y=75;
  function line(value,size=23) {
    ctx.font=`${size}px serif`;
    for (const paragraph of value.split('\n')) {
      let row='';
      for (const word of paragraph.split(/\s+/)) {
        if (row && ctx.measureText(row+' '+word).width>width) {
          ctx.fillText(row,margin,y); y+=size+5; row='';
        }
        row += (row?' ':'')+word;
      }
      if (row) { ctx.fillText(row,margin,y,width); y+=size+5; }
    }
  }
  for (const child of side.children) {
    if (child.tagName!=='TABLE') {
      line(child.innerText, child.tagName==='H2'?36:23);
      y+=6;
      continue;
    }
    const reverse = side.classList.contains('vu-reverse');
    const columns = reverse ? [0.18,0.16,0.12,0.09,0.14,0.14,0.17] : [0.15,0.15,0.27,0.43];
    ctx.font='21px serif';
    for (const row of child.rows) {
      const lines = Array.from(row.cells, (cell,i) => {
        const limit = width*columns[i]-12, result=[''];
        for (const ch of cell.innerText) {
          if (ctx.measureText(result.at(-1)+ch).width>limit) result.push('');
          result[result.length-1]+=ch;
        }
        return result;
      });
      const height = Math.max(...lines.map(cell=>cell.length))*25 + (reverse ? 16 : 2);
      let x = margin;
      lines.forEach((cell,i)=>{
        const cellWidth = width*columns[i];
        ctx.strokeRect(x,y,cellWidth,height);
        cell.forEach((value,j)=>ctx.fillText(value,x+6,y+21+j*25));
        x += cellWidth;
      });
      y+=height;
    }
    y+=32;
  }
  if(y>page.height-margin) return null;
  const jpeg=await new Promise(resolve=>page.toBlob(resolve,'image/jpeg',0.94));
  return jpeg ? { jpeg:new Uint8Array(await jpeg.arrayBuffer()), w:page.width, h:page.height } : null;
}
async function exportCertificate(paperNode) {
  const pages=[];
  for (const side of paperNode.children) {
    const page=await renderPaperSide(side);
    if (!page) { window.print(); return; }
    pages.push(page);
  }
  const title='Справка ВУ-45';
  const bytes=pdfFromJpegPages(pages,{title});
  await deliverPdf(new Blob([bytes],{type:'application/pdf'}),'CABINA-VU45-'+d.date.slice(0,10)+'.pdf',{
    shareTitle:title,readyTitle:title,readyText:'Файл справки подготовлен.',savedText:'Справка сохранена в PDF'
  });
}

export function bindVu45() {
  const root=document.querySelector('#vu45');
  const redraw=(reset=false)=>{ sections.clear(); if (!reset) root.querySelectorAll("details[open]").forEach(el=>sections.add(el.dataset.section)); root.parentElement.innerHTML=renderVu45(); bindVu45(); };
  root.querySelectorAll('details').forEach(el=>el.ontoggle=()=>{ if (!el.isConnected) return; if(el.open) sections.add(el.dataset.section); else sections.delete(el.dataset.section); });
  root.oninput=e=>{
    const t=e.target, {field,col,check}=t.dataset;
    if (field) d[field]=t.type==='checkbox'?t.checked:t.value;
    else if(t.dataset.route) d.enRoute[Number(t.closest('[data-entry]').dataset.entry)][t.dataset.route]=t.value;
    else if(col) {
      const row=d.groups[Number(t.closest('[data-group]').dataset.group)];
      row[col]=t.value;
      if(col==='type') row.rate=String(rates[Number(t.value)][1]);
    } else if(check!=null) {
      d.checked=d.checked.filter(i=>i!==Number(check));
      if(t.checked) d.checked.push(Number(check));
    } else return;
    if(field==='specialPreset') {
      d.acceptedRate=({passenger:'60',metro:'33',loaded:'30'})[t.value] || '';
      root.querySelector('[data-field=acceptedRate]').value=d.acceptedRate;
    }
    if (field==='acceptedRate') {
      d.specialPreset='';
      root.querySelector('[data-field=specialPreset]').value='';
    }
    if (field==='category') {
      d.heavyAxle=false; d.symmetric=false; d.includeLoco=false; d.eptFailure=false; d.green=false; d.exception=false; d.weakest=false;
    }
    if (['joinedReservoirs','volume','high','axes','category','freight','off'].includes(field) || col==='axes') {
      d.joinedMinimum='';
      const minimumInput=root.querySelector('[data-field=joinedMinimum]');
      if (minimumInput) minimumInput.value='';
    }
    if(field==='testVolume') delete d.series;
    if (['specialSource','specialPreset','acceptedRate','weight','axes','category','mode','localNorm'].includes(field)) {
      d.specialChecked=false;
      const checkbox=root.querySelector('[data-field=specialChecked]');
      if (checkbox) checkbox.checked=false;
    }
    save();
    if(['category','mode','series','includeLoco','locoMethod','joinedReservoirs'].includes(field) || col==='type') { redraw(); return; }
    for (const [id,content] of [['result',result()],['paper',paper()],['hand',hand()],['measures',measurements()],['count',d.checked.length],['times',times()]]) root.querySelector('#vu-'+id).innerHTML=content;
  };
  root.onclick=async e=>{
    const b=e.target.closest('[data-vu]');
    if(!b) return;
    switch(b.dataset.vu) {
      case 'copy':
        try { await navigator.clipboard.writeText(root.querySelector('article').innerText); toast('Справка скопирована'); }
        catch { toast('Копирование недоступно в этом браузере'); }
        return;
      case 'pdf':
        try { await exportCertificate(root.querySelector('article')); } catch { window.print(); }
        return;
      case 'mode':
        if (d.mode===b.dataset.mode) return;
        d.mode=b.dataset.mode; d.specialChecked=false; break;
      case 'clear-checks':
        if (!d.checked.length || !await confirmDialog({title:'Сбросить отметки проверки?',text:'Данные поезда сохранятся.',ok:'Сбросить'})) return;
        d.checked=[]; break;
      case 'add-entry': d.enRoute.push({}); break;
      case 'remove-entry': d.enRoute.splice(Number(b.closest('[data-entry]').dataset.entry),1); break;
      case 'add': d.groups.push(group()); break;
      case 'remove': d.groups.splice(Number(b.closest('[data-group]').dataset.group),1); break;
      case 'reset':
        if(!await confirmDialog({ title:'Начать новый поезд?',text:'Текущая справка и отметки проверки будут очищены.',ok:'Новый поезд' })) return;
        d=blank(); sections.clear(); break;
    }
    if (['mode','add','remove'].includes(b.dataset.vu)) d.joinedMinimum='';
    save(); redraw(b.dataset.vu==="reset");
  };
}
