export const rub=n=> n==null?'—':n.toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' ₽';
const num=n=>n.toLocaleString('ru-RU',{maximumFractionDigits:2});
const sum=rows=>rows.reduce((a,r)=>a+Math.round(r.amount*100),0)/100;
const known=(...xs)=>xs.every(Number.isFinite);
const note=(status,title,detail)=>({status,title,detail});
const missing=title=>note('unknown',title,'В распознанных строках недостаточно данных для этой проверки.');
function check(title,expected,actual,formula,tolerance=0) {
  if(!known(expected,actual)) return missing(title);
  const diff=Math.round(actual*100)-Math.round(expected*100);
  const status=diff===0?'ok':Math.abs(diff)<=tolerance?'approx':'diff';
  return note(status,title,formula+' = '+rub(expected)+'. В листке '+rub(actual)+'.'+(diff?' Разница '+rub(diff/100)+'.':''));
}
const names={
  '004':'Повременная оплата по тарифной ставке','010':'Премия за работу','011':'Премия рабочим по времени','018':'Оплата по тарифу','023':'Доплата за работу в ночное время','026':'Районный коэффициент','027':'Северная надбавка','035':'Оплата выходных дней сверх нормы времени','049':'Техническая учёба в нерабочее время','052':'Оплата по тарифу','057':'Доплата за вредные условия труда','072':'Оплата работы сверх нормы часов','073':'Доплата за сверхурочные','076':'Доплата за выходные и праздники сверх нормы','152':'Доплата за тяжеловесные и длинносоставные поезда','172':'Выплата за время отдыха сверх нормы','174':'Оплата медосвидетельствования','248':'Премия за экономию ресурсов','349':'Возмещение расходов на наём жилья','461':'Компенсация дополнительных расходов, суточные','880':'Плановый аванс','881':'Разовая выплата через банк','883':'Удержанный НДФЛ','902':'Профсоюзные взносы','932':'Удержание взноса',
};
const travel=new Set(['374D','374P']);
const regionalBase=/^(004|018|023|035|052|057|072|073|076|152)/;
function taxChecks(s,checks,holds) {
  if(s.taxes.length && s.taxes.every(t=>known(t.base))) {
    const base=s.taxes.reduce((a,t)=>a+t.base,0), deduction=s.deductions.reduce((a,v)=>a+v,0);
    checks.push(check('Налоговые базы и вычеты',base+deduction,s.taxable,rub(base)+' + вычеты '+rub(deduction)));
  }
  for(const t of s.taxes) {
    const title='НДФЛ '+(t.kind==='regional'?'с РК и СН':'с основной базы')+' · '+t.pct+' %';
    if(known(t.base,t.calculated)) {
      let expected=Math.round(t.base*t.pct/100), formula=rub(t.base)+' × '+t.pct+' % с округлением';
      if(known(t.baseYear,t.calculatedYear) && t.calculatedYear===Math.round(t.baseYear*t.pct/100)) {
        const previous=Math.round((t.baseYear-t.base)*t.pct/100);
        expected=t.calculatedYear-previous;
        formula='Налог с начала года '+rub(t.calculatedYear)+' − налог по базе до начала месяца '+rub(previous);
      }
      checks.push(check(title,expected,t.calculated,formula,100));
    } else checks.push(missing(title));
    checks.push(check(title+' · удержано и исчислено',t.calculated,t.withheld,'Исчислено по справке'));
  }
  const taxRows=holds.filter(r=>/^883/.test(r.code));
  if(taxRows.length && s.taxes.length && s.taxes.every(t=>known(t.withheld))) checks.push(check('Удержанный НДФЛ в таблице и в справке',s.taxes.reduce((a,t)=>a+t.withheld,0),sum(taxRows),'Удержано по налоговым базам'));
}
function rowCheck(r,title,ctx) {
  const {s,profile,current,premiums,month}=ctx, prefix=r.code.slice(0,3);
  const same=month===r.month;
  if(r.kind==='natural') return note('info',title,travel.has(r.code)?'Работодатель оплатил проезд. Стоимость билетов отражена как натуральный доход и не прибавляется к деньгам на карту.':'Доход предоставлен в натуральной форме и показан отдельно от денег к выплате.');
  if(same && known(r.hours,s.rate)) {
    const hourly=(factor,label)=>check(title,r.hours*s.rate*factor,r.amount,num(r.hours)+' ч × '+rub(s.rate)+label,1);
    if(/^(004L|018[A-Z]?|049A|052L|072L)$/.test(r.code)) return hourly(1,'');
    if(/^(023|152)/.test(r.code) && known(r.pct)) return hourly(r.pct/100,' × '+num(r.pct)+' %');
    if(prefix==='073' && /0[,.]5|1[,.]0/.test(r.name)) {const k=/0[,.]5/.test(r.name)?0.5:1;return hourly(k,' × '+num(k));}
    if(r.code==='172L') return hourly(2/3,' × ⅔');
    if(r.code==='057L') {
      const pct=r.pct??profile.harm??4, extra=sum(current.filter(x=>/^073/.test(x.code)));
      const row=check(title,(r.hours*s.rate+extra)*pct/100,r.amount,'('+num(r.hours)+' ч × '+rub(s.rate)+' + '+rub(extra)+') × '+pct+' %',1);
      if(r.pct==null) {row.status='approx';row.detail+=' Процент взят '+(profile.harm!=null?'из настроек профиля':'из примера формы')+'. Уточните его в карте СОУТ.';}
      return row;
    }
  }
  if(same && /^02[67][ABK]$/.test(r.code) && known(r.pct)) {
    const suffix=r.code[3];
    const rows=suffix==='A'?current.filter(x=>regionalBase.test(x.code)):suffix==='B'?premiums:current.filter(x=>x.code==='172L');
    if(rows.length) {
      const what=suffix==='A'?'Тариф и доплаты':suffix==='B'?'Премии за предыдущие периоды':'Выплата 172L';
      const row=check(title,sum(rows)*r.pct/100,r.amount,what+' '+rub(sum(rows))+' × '+r.pct+' %',1);
      if(row.status==='diff') {row.status='approx';row.detail+=' Уточните состав базы у расчётчика.';}
      return row;
    }
  }
  if(/^(010|011|248)/.test(r.code)) return note('unknown',title,'Для проверки размера премии нужны показатели премирования за соответствующий период.');
  if(r.code==='174M') return note('unknown',title,'Оплата по среднему заработку. Одного листка недостаточно для проверки среднего.');
  if(r.code==='880A') return note('info',title,'Аванс учтён в перечислениях за месяц и уменьшает остаток к выплате.');
  if(r.code==='461L' || r.code==='881A') {
    const other=r.code==='461L'?'881A':'461L', matching=code=>s.rows.filter(x=>x.code===code && x.month===r.month);
    if(matching(other).length===1 && matching(r.code).length===1) return check(title,matching(other)[0].amount,r.amount,'Сверка компенсации и отдельного перечисления по строке '+other);
  }
  if(r.code==='902A' && s.taxable>0) return note('info',title,rub(r.amount)+' составляет '+num(100*r.amount/s.taxable)+' % от облагаемого дохода '+rub(s.taxable)+'.');
  if(/^883[AH]$/.test(r.code)) {
    const taxes=s.taxes.filter(t=>t.kind===(r.code==='883H'?'regional':'main'));
    if(taxes.length && taxes.every(t=>known(t.withheld)) && s.rows.filter(x=>x.code===r.code).length===1) return check(title,taxes.reduce((v,t)=>v+t.withheld,0),r.amount,'Удержано по этой части налоговой справки');
  }
  return note('unknown',title,'Для независимой проверки этой суммы нужны дополнительные данные.');
}
export function auditPayslip(s,profile={}) {
  const checks=[], earnings=s.rows.filter(r=>r.kind==='earnings'), holds=s.rows.filter(r=>r.kind==='deductions'), natural=s.rows.filter(r=>r.kind==='natural');
  const add=(...args)=>checks.push(check(...args));
  if(earnings.length) add('Сумма строк начислений',sum(earnings),s.gross,'Сложили '+earnings.length+' строк начислений');
  if(holds.length) add('Сумма удержаний и перечислений',sum(holds),s.deducted,'Сложили '+holds.length+' строк удержаний');
  if(known(s.gross,s.deducted,s.cash)) add('К перечислению через банк',s.gross-s.deducted-s.cash,s.bank,rub(s.gross)+' − '+rub(s.deducted)+' − '+rub(s.cash));
  else checks.push(missing('К перечислению через банк'));
  if(natural.length) add('Доходы в натуральной форме',sum(natural),s.inKind,'Стоимость по '+natural.length+' строкам');
  if(known(s.gross,s.inKind)) add('Денежный и натуральный доход',s.gross+s.inKind,s.income,rub(s.gross)+' + '+rub(s.inKind));
  const exempt=earnings.filter(r=>/^(461L|504P|504S)$/.test(r.code));
  if(known(s.income,s.taxable) && exempt.length) {
    const x=check('Облагаемый доход по справке',s.income-sum(exempt),s.taxable,rub(s.income)+' − компенсации '+rub(sum(exempt)));
    if(x.status==='diff') {x.status='approx';x.detail+=' Возможны другие исключения из базы или разные периоды выплат.';}
    checks.push(x);
  }
  const tickets=natural.filter(r=>travel.has(r.code)), main=s.taxes.filter(t=>t.kind==='main' && known(t.base,t.withheld));
  if(tickets.length && main.length===1 && known(s.gross,s.inKind,s.income,s.taxable) && Math.abs(s.gross+s.inKind-s.income)<0.01 && Math.abs(s.income-sum(exempt)-s.taxable)<0.01) {
    checks.push(note('info','Проезд за счёт работодателя',rub(sum(tickets))+' вошли в доход в натуральной форме. При ставке '+main[0].pct+' % на билеты приходится примерно '+rub(sum(tickets)*main[0].pct/100)+' налога. Эта доля уже входит в НДФЛ за месяц.'));
  }
  taxChecks(s,checks,holds);
  if(known(s.pensionBase,s.insurance)) {
    const x=check('Страховые взносы работодателя',s.pensionBase*0.30,s.insurance,rub(s.pensionBase)+' × 30 %',1);
    if(x.status==='diff') {x.status='approx';x.detail+=' Уточните применяемый тариф взносов.';}
    checks.push(x);
  }
  if(known(s.worked,s.norm)) checks.push(note('info','Отработано '+num(s.worked)+' ч при норме '+num(s.norm)+' ч','Разница '+num(s.worked-s.norm)+' ч. Для проверки учтённого времени нужны поездки и табель.'));
  const month=s.period?.split(' ')[0], current=earnings.filter(r=>r.month===month), premiums=earnings.filter(r=>month && r.month!==month && /^(010|011)/.test(r.code));
  const items=s.rows.map(r=>({...r,...rowCheck(r,travel.has(r.code)?'Проезд за счёт работодателя':names[r.code.slice(0,3)] || r.name || 'Строка листка',{s,current,premiums,month,profile})}));
  for(const item of items.filter(r=>/^02[67][ABK]$|^023|^902A/.test(r.code))) checks.push({...item,title:item.title+' ('+item.code+')'});
  const hourly=items.filter(r=>/^(004L|018[A-Z]?|049A|052L|072L|073L)$/.test(r.code) && r.status!=='unknown');
  if(hourly.length) checks.push(note(hourly.some(x=>x.status==='diff')?'diff':hourly.some(x=>x.status==='approx')?'approx':'ok','Часы и оплата по тарифу','Проверено строк по тарифу '+rub(s.rate)+' — '+hourly.length+'. Формулы приведены ниже.'));
  for(const [code,key,label] of [['026A','rk','Районный коэффициент'],['027A','sn','Северная надбавка']]) {
    const row=current.find(r=>r.code===code);
    if(known(row?.pct,profile[key])) checks.push(note(row.pct===profile[key]?'ok':'approx',label+' в листке и профиле',num(row.pct)+' % в листке, '+num(profile[key])+' % в профиле. Ставка могла измениться.'));
  }
  if(known(s.rate,profile.rate)) checks.push(note('info','Часовая тарифная ставка','В листке '+rub(s.rate)+', в профиле на этот период '+rub(profile.rate)+'.'));
  if(s.unread) checks.unshift(note('unknown','Часть строк не распознана','Строк без читаемого кода или суммы — '+s.unread+'. Сверьте отчёт с оригиналом.'));
  return {checks,items};
}
