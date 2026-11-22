import {compareTrips,monthLabel,validMonth} from './payslip-compare.js';
import {esc,I,small,pageHead} from './ui.js';
import {S,myPay,rememberPayslipBonus} from './store.js';
import {paySet,rateOn} from './pay.js';
import {parsePayslip,months} from './payslip-parse.js';
import {auditPayslip,rub,takeHome} from './payslip-report.js';
import {readPayslip} from './payslip-reader.js';
const title='Расчётный листок';
const slipArt='<img class="ps-art" src="icons/payslip.webp" alt="" width="320" height="320">';
const labels={ok:['✓','Сошлось'],approx:['≈','Приблизительно'],diff:['!','Расхождение'],info:['i','Справочно'],unknown:['?','Недостаточно данных']};
const groups={earnings:'Начислено',deductions:'Удержано и перечислено',natural:'Доходы в натуральной форме'};
let job=null,status='',result='',failure='',generation=0,ocrText='',editing=false;
let compare=false,selectedMonth='',savedPeriod='',lastSheet=null,lastOCR=false;
export function clearPayslip() {clearDocument(); compare=false; selectedMonth='';}
export function choosePayslipMonth(month,refresh) {
  selectedMonth=validMonth(month)?month:'';
  if(lastSheet) result=report(lastSheet,lastOCR);
  refresh();
}
function periodKey(period) {
  const [name,year]=String(period||'').split(' '), month=months.indexOf(name)+1;
  const key=year+'-'+String(month).padStart(2,'0');
  return validMonth(key)?key:'';
}
function monthOptions() {
  const keys=new Set([selectedMonth,periodKey(lastSheet?.period)]);
  for(const trip of S.trips) {
    for(const date of [trip.start,trip.end]) if(typeof date==='string') keys.add(date.slice(0,7));
  }
  const now=new Date();
  for(let i=0;i<24;i++){
    const d=new Date(now.getFullYear(),now.getMonth()-i,1);
    keys.add(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'));
  }
  return '<option value="">Определить по листку</option>'+[...keys].filter(validMonth).sort().reverse().map(key=>
    '<option value="'+key+'"'+(key===selectedMonth?' selected':'')+'>'+monthLabel(key)+'</option>').join('');
}
function clearDocument() {
  savedPeriod='';lastSheet=null;lastOCR=false;
  job?.abort(); job=null;status='';result='';failure='';generation++;ocrText='';editing=false;
}
export function payslipCard() {
  return `<button class="ps-link ps-feature" data-act="go" data-page="payslip">
    <span class="ps-feature-copy"><strong>${title}</strong><span>Начисления, удержания и сумма на руки</span>
      <span class="btn btn-primary ps-cta">Проверить ${small(I.right,18)}</span>
    </span>${slipArt}</button>`;
}
function row(x,entry=false) {
  const [symbol,label]=labels[x.status];
  return '<li class="ps-row ps-'+x.status+'"><span class="ps-mark" aria-label="'+label+'">'+symbol+'</span><div><b>'+(entry?esc(x.code)+' · ':'')+esc(x.title)+'</b>'+
    (entry?' <strong>'+esc(rub(x.amount))+'</strong><small>'+esc(x.month)+'</small>':'')+'<p>'+esc(x.detail)+'</p></div></li>';
}
const sections=[
  {key:'ok',label:'Сошлось',icon:'✓',statuses:['ok']},
  {key:'approx',label:'Требует внимания',icon:'≈',statuses:['approx','unknown']},
  {key:'diff',label:'Не сошлось',icon:'!',statuses:['diff']}
];
function list(title,rows,entries=false) {
  return rows.length?'<h3>'+title+'</h3><ul>'+rows.map(x=>row(x,entries)).join('')+'</ul>':'';
}
function section(spec,checks,items) {
  const matches=x=>spec.statuses.includes(x.status);
  const audits=checks.filter(matches), lines=items.filter(matches);
  const count=audits.length+lines.length;
  let body=list('Проверки',audits);
  for(const [kind,label] of Object.entries(groups)) body+=list(label,lines.filter(x=>x.kind===kind),true);
  if(!count) body='<p class="ps-empty">'+({ok:'Пока нет подтверждённых совпадений.',approx:'Уточнений не требуется.',diff:'Расхождений по выполненным проверкам нет.'}[spec.key])+'</p>';
  if(spec.key==='approx') {
    const infoChecks=checks.filter(x=>x.status==='info'),infoRows=items.filter(x=>x.status==='info');
    if(infoChecks.length || infoRows.length) {
      body+='<details class="ps-info"><summary>Справочно <span>'+ (infoChecks.length+infoRows.length)+'</span></summary>'+
        list('За месяц',infoChecks)+list('Строки листка',infoRows,true)+'</details>';
    }
  }
  return '<details class="ps-group ps-'+spec.key+'" data-ps-group="'+spec.key+'"><summary><span class="ps-mark" aria-hidden="true">'+spec.icon+
    '</span><b>'+spec.label+'</b><span class="ps-count">'+count+'</span><i aria-hidden="true"></i></summary><div class="ps-body">'+body+'</div></details>';
}
function report(sheet,ocr) {
  if(compare){
    const key=selectedMonth||periodKey(sheet.period);
    const {message,rows,count}=compareTrips(sheet,key,S.trips,S.absences,myPay());
    const value=h=>Number.isFinite(h)?h.toLocaleString('ru-RU')+' ч':'—';
    const body=message?'<p>'+esc(message)+'</p>':'<p>Поездок за месяц — '+count+'</p><ul>'+rows.map(x=>row({...x,detail:'CABINA · '+value(x.cabina)+' / Листок · '+value(x.sheet)+'. '+x.detail})).join('')+'</ul>';
    return '<section class="panel ps-panel" id="ps-details" data-report="'+generation+'"><h2>Сверка за '+esc(validMonth(key)?monthLabel(key):'выбранный месяц')+'</h2>'+body+'<button class="btn btn-ghost" data-act="ps-clear">Очистить отчёт</button></section>';
  }
  const payout=takeHome(sheet);
  const raw=paySet(S.settings.pay,S.profile.role),profile={};
  for(const key of ['rk','sn','harm']) if(raw[key]!=null && raw[key]!=='' && Number.isFinite(+raw[key])) profile[key]=Number(raw[key]);
  if(sheet.period && raw.rates?.length) {
    const [m,y]=sheet.period.split(' '),rate=rateOn(raw,y+'-'+String(months.indexOf(m)+1).padStart(2,'0')+'-01');
    if(rate) profile.rate=rate;
  }
  const {checks,items}=auditPayslip(sheet,profile);
  const totals=[['Начислено',sheet.gross],['Удержано и перечислено',sheet.deducted],['На руки',payout.total]];
  return '<section class="panel ps-panel ps-report" id="ps-details" data-report="'+generation+'"><h2>Листок'+(sheet.period?' за '+esc(sheet.period):'')+'</h2>'+
    (ocr?'<p class="ps-alert">Данные распознаны с изображения. Сверьте коды, часы и суммы с оригиналом.</p>':'')+
    '<dl class="ps-totals">'+totals.map(([k,v])=>'<div><dt>'+k+'</dt><dd>'+rub(v)+'</dd></div>').join('')+'</dl>'+
    (payout.total!=null?'<p class="hint">Аванс '+rub(payout.advance)+' + зарплата через банк '+rub(payout.bank)+(payout.cash?' + через кассу '+rub(payout.cash):'')+'.</p>':'<p class="hint">Для итога на руки нужны все строки выплат и удержаний.</p>')+
    sections.map(spec=>section(spec,checks.filter(x=>!x.code),items)).join('')+
    '<button class="btn btn-ghost ps-clear" data-act="ps-clear">Очистить отчёт</button></section>';
}
export function renderPayslip() {
  const draft=document.querySelector('#ps-correction');
  if(editing && draft) ocrText=draft.value;
  const existing=document.querySelector('#ps-details');
  const opened=existing?.dataset.report===String(generation)
    ? [...existing.querySelectorAll('details[open]')].map(el=>el.dataset.psGroup || 'info') : [];
  let shown=result;
  for(const key of opened) {
    const attr=key==='info'?'class="ps-info"':'data-ps-group="'+key+'"';
    shown=shown.replace(attr+'>',attr+' open>');
  }
  const choose = `<label class="btn ${result?'btn-ghost':'btn-primary'} ps-upload">
    ${small(I.upload,20)}${result?'Выбрать другой листок':'Выбрать PDF или фото'}
    <input aria-label="Выбрать PDF или фото" id="ps-files" type="file" accept="application/pdf,image/*" multiple>
  </label>`;
  const privacy = `<p class="ps-private">${small(I.shield,18)}<span>Файл обрабатывается на устройстве. Перед выбором файла закройте ФИО, табельный номер и реквизиты. Для прогноза премии сохраняются месячные итоги.</span></p>`;
  const feedback = '<div role="status" class="hint ps-feedback">'+esc(status||failure)+'</div>';
  const audit = `<section class="panel ps-panel ps-audit">
    <div class="ps-feature"><div class="ps-feature-copy"><h2>Проверить начисления</h2><p>Сверьте начисления, удержания и сумму на руки.</p></div>${slipArt}</div>
    ${choose}${feedback}
  </section>
  <button class="panel ps-compare-link row" data-act="ps-compare">
    <span class="ico">${I.train}</span><span class="grow"><span class="t1">Сверить с поездками в CABINA</span>
    <span class="t2">Сравните часы в листке с поездками за месяц.</span></span>${small(I.right,18)}
  </button>`;
  const trips = `<section class="panel ps-panel ps-trip-form">
    <h2>Сверить с поездками в CABINA</h2><p>Сравните часы в листке с поездками, которые вы записали за месяц.</p>
    <label class="ps-month-label" for="ps-month">Месяц поездок</label>
    <select class="input" id="ps-month">${monthOptions()}</select>
    ${choose}${feedback}
  </section>`;
  return pageHead(compare?'Сверка с поездками':title,{back:true})+shown+(compare?trips:audit)+privacy+
    (ocrText?'<section class="panel ps-panel">'+(editing?'<label for="ps-correction">Сверьте текст с оригиналом. В кодах строк распознавание может перепутать букву L и цифру 1.</label><textarea id="ps-correction" rows="9" spellcheck="false" autocorrect="off" autocomplete="off">'+esc(ocrText)+'</textarea><button class="btn btn-primary" data-act="ps-apply">Пересчитать</button>':'<button class="btn btn-ghost" data-act="ps-edit">Исправить распознавание</button>')+'</section>':'');
}
async function acceptSheet(sheet,ocr) {
  lastSheet=sheet; lastOCR=ocr;
  result=report(sheet,ocr);
  if(!compare || !selectedMonth || sheet.period===monthLabel(selectedMonth)){
    const previous=savedPeriod;
    savedPeriod=sheet.period;
    await rememberPayslipBonus(sheet,previous);
  }
}
export async function loadPayslip(files,refresh) {
  if(!files.length) return;

  clearDocument();const controller=new AbortController();job=controller;
  const update=s=>{if(job===controller){status=s;refresh();}};
  try {
    update('Открываем файл…');
    const {text,usedOCR}=await readPayslip(files,update,controller.signal);
    if(job!==controller) return;
    if(usedOCR) ocrText=text;
    const sheet=parsePayslip(text);
    if(!sheet.rows.length && !(compare && Number.isFinite(sheet.worked))) throw Error('Не удалось прочитать строки формы ФТУ-69. Попробуйте исходный PDF или более чёткое фото таблицы.');
    await acceptSheet(sheet,usedOCR);
  } catch(e) {
    if(job===controller) {
      const reasons={
        PasswordException:'PDF защищён паролем. Выберите разблокированную копию.',
        InvalidPDFException:'Не удалось прочитать структуру PDF. Попробуйте заново сохранить исходный листок.',
        NotReadableError:'Телефон не смог прочитать выбранный файл. Сохраните его на устройстве и выберите ещё раз.',
        NotFoundError:'Файл недоступен. Откройте его в «Файлах», затем выберите ещё раз.',
      };
      failure=/^(Выберите|Не удалось прочитать|Не удалось загрузить модуль)/.test(e.message)
        ? e.message : reasons[e.name] || 'Не удалось обработать содержимое файла. Попробуйте другую копию или фотографии страниц.';
    }
  } finally {if(job===controller){status='';job=null;refresh();}}
}

export async function payslipAction(act,refresh) {
  if(act==='ps-compare'||(compare && act==='back')){
    const sheet=lastSheet, text=ocrText, ocr=lastOCR;
    clearPayslip();compare=act==='ps-compare';
    if(sheet){lastSheet=sheet;ocrText=text;lastOCR=ocr;result=report(sheet,ocr);}
    refresh();window.scrollTo(0,0);return true;
  }
  if(act==='ps-clear') {clearDocument();refresh();return true;}
  if(act==='ps-edit') { editing=true;refresh();document.querySelector('#ps-correction')?.focus();return true; }
  if(act!=='ps-apply') return false;
  ocrText=document.querySelector('#ps-correction')?.value ?? ocrText;
  try {
    const sheet=parsePayslip(ocrText);
    if(!sheet.rows.length && !(compare && Number.isFinite(sheet.worked))) throw Error('Проверьте строки с месяцем, кодом и суммой.');
    generation++;editing=false;failure=''; await acceptSheet(sheet,true);
  } catch(e) {failure=e.message;result='';}
  refresh();return true;
}
