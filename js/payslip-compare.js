import {legsOf, monthSummary, tripStats} from './calc.js';
import {heavyMin, isHeavy, minutesInMonth, overRestIntervals, payMonth, sectionMinutes} from './pay.js';
import {rub} from './payslip-report.js';
import {months} from './payslip-parse.js';

export const validMonth = key => /^20\d{2}-(0[1-9]|1[012])$/.test(key);
export const monthLabel = key => months[Number(key.slice(5))-1]+' '+key.slice(0,4);
const fmt = n => n.toLocaleString('ru-RU',{maximumFractionDigits:2});

export function compareTrips(sheet,key,trips,absences,cfg={}) {
  if (!validMonth(key)) return {message:'Не удалось определить месяц. Проверьте заголовок первой страницы листка.'};
  if (!sheet.period) return {message:'Не удалось прочитать месяц и год листка.'};
  if (sheet.period!==monthLabel(key)) return {message:'Выбран '+monthLabel(key)+', в листке указан '+sheet.period+'. Выберите соответствующий месяц или другой файл.'};
  const [year,month]=key.split('-').map(Number), summary=monthSummary(year,month,trips,absences);
  if (!summary.monthTrips.length) return {message:'За '+sheet.period+' в CABINA нет поездок. Добавьте поездки для сверки.'};
  const incomplete=summary.monthTrips.some(t=>!t.end)?'Есть незавершённая поездка. Укажите время окончания для сверки.':'';
  const stats=t=>t._stats||tripStats(t), rest=overRestIntervals(trips,stats);
  const current=sheet.rows.filter(r=>r.kind==='earnings' && r.month===months[month-1]);
  const tariff=!incomplete && cfg.mode==='tariff' && summary.monthTrips.every(t=>cfg.rates?.some(r=>r.rate>0&&(!r.from||r.from<=t.start.slice(0,10))));
  const pay=tariff?payMonth(year,month,trips,absences,cfg,stats,{overRest:rest}):null;
  // прогноз CABINA на месяц (как на главной) против «Всего начислено» в листке — ориентировочно
  const est=!incomplete&&Number.isFinite(sheet.gross)?(pay||payMonth(year,month,trips,absences,cfg,stats,{overRest:rest})):null;
  const money=est?.hasRate&&est.gross>0?{cabina:est.gross,sheet:sheet.gross}:null;
  const rows=[];
  function metric(title,minutes,sheetHours,reason,count=1) {
    const cabina=Number.isFinite(minutes)?Math.round(minutes/60*100)/100:null;
    const row={title,cabina,sheet:sheetHours,status:'unknown',detail:reason||'Часы не распознаны в листке.'};
    if (!reason && Number.isFinite(sheetHours) && cabina!==null) {
      row.delta=Math.round((sheetHours-cabina)*100)/100;
      row.status=!row.delta?'ok':Math.abs(row.delta)<=count*.005?'approx':'diff';
      row.detail=row.delta?(row.delta>0?'В листке больше на ':'В листке меньше на ')+fmt(Math.abs(row.delta))+' ч.':'Часы совпадают.';
    }
    rows.push(row);
    return row;
  }
  metric('Всего отработано',summary.work,sheet.worked,incomplete);
  if(Number.isFinite(sheet.norm)){
    const norm=metric('Норма часов по закону',summary.base*60,sheet.norm);
    if(norm.status==='diff') norm.detail+=' CABINA считает норму по шестидневке или пятидневке — как выбрано в Настройках → «Календарь и часовой пояс».';
  }
  function hours(title,minutes,code,reason='',payKey) {
    const all=current.filter(r=>code.test(r.code));
    if (!minutes && !all.length && !/^Ночные/.test(title)) return;
    // строки без часов (доплата разовой суммой, например 023Q) не мешают сверить часы по остальным
    const matches=all.filter(r=>Number.isFinite(r.hours)), noHours=all.filter(r=>!Number.isFinite(r.hours));
    if (!reason && (!matches.length || matches.some(r=>r.amount<0&&r.hours>0))) reason='Проверьте часы в строках листка за выбранный месяц.';
    const total=reason?null:matches.reduce((n,r)=>n+Math.round(r.hours*100),0)/100;
    const row=metric(title,minutes,total,incomplete||reason,matches.length);
    if(noHours.length && row.status!=='unknown'){
      if(row.status==='ok') row.status='approx';
      row.detail+=' Без часов в листке: '+noHours.map(r=>r.code).join(', ')+' — эти строки не сверяли.';
    }
    if(sheet.unread && row.status!=='unknown'){
      row.status='approx'; row.detail+=' Сравнение по прочитанным строкам. Часть строк листка не распознана.';
    }
    if(pay && payKey && row.status!=='unknown'){
      const expected=pay.lines.filter(l=>payKey.test(l.key)).reduce((n,l)=>n+Math.round(l.amount*100),0);
      const actual=all.reduce((n,r)=>n+Math.round(r.amount*100),0);
      row.detail+=' По тарифам CABINA '+rub(expected/100)+', в листке '+rub(actual/100)+'.';
      if(actual!==expected && row.status==='ok') row.status=Math.abs(actual-expected)<=matches.length?'approx':'diff';
    }
  }
  hours('Ночные часы',summary.night,/^023/);
  hours('Следование пассажиром',summary.pass,/^018L$/,'',/^pass$/);
  hours('Ожидание следования пассажиром',summary.wait,/^018M$/,'',/^wait$/);
  let reserve=0,section=0,heavy=0,unknownDistance=false,unknownHeavy=false;
  for(const t of summary.monthTrips){
    const st=stats(t),part=st.byMonth[key]; if(!part) continue;
    heavy+=heavyMin(t,st,cfg,key);
    if(t.kind==='reserve') reserve+=part.work-part.wait-part.pass;
    if(!['reserve','shunt'].includes(t.kind)) unknownHeavy ||= legsOf(t).some((leg,i)=>{
      if(!(st.legs?st.legs[i]?.byMonth[key]:part.work-part.wait-part.pass)||isHeavy(leg,cfg)) return false;
      const n=cfg.norms?.[leg.routeId];
      return !(n?.weight>0||n?.length>0)||(n.weight>0&&!(leg.weight>0))||(n.length>0&&!(leg.length>0));
    });
    for(const [pct,mins] of sectionMinutes(t,st,cfg,key)){if(pct===null&&mins) unknownDistance=true; if(pct>0)section+=mins;}
  }
  hours('Одиночно следующий локомотив',reserve,/^052L$/,'',/^reserve$/);
  hours('Работа на удлинённых участках',unknownDistance?null:section,/^151/,unknownDistance?'Укажите расстояние участков.':'',/^section\d+$/);
  hours('Тяжеловесные и длинносоставные поезда',unknownHeavy?null:heavy,/^152L$/,unknownHeavy?'Проверьте вес, длину поезда и нормы участка.':'');
  const latest=trips.reduce((last,t)=>!last||stats(t).start>stats(last).start?t:last,null);
  const missing=latest?.restType==='turnaround'&&summary.monthTrips.includes(latest);
  hours('Отдых в пункте оборота сверх нормы',missing?null:minutesInMonth(rest,key),/^172L$/,missing?'Нужна следующая явка.':'');
  return {rows,count:summary.monthTrips.length,money};
}
