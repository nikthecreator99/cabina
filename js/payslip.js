import {esc,I,small,pageHead} from './ui.js';
import {S} from './store.js';
import {paySet,rateOn} from './pay.js';
import {parsePayslip,months} from './payslip-parse.js';
import {auditPayslip,rub} from './payslip-report.js';
import {readPayslip} from './payslip-reader.js';
const title='Проверка расчетного листка';
const labels={ok:['✓','Сошлось'],approx:['≈','Приблизительно'],diff:['!','Расхождение'],info:['i','Справочно'],unknown:['?','Недостаточно данных']};
const groups={earnings:'Начислено',deductions:'Удержано и перечислено',natural:'Доходы в натуральной форме'};
let job=null,status='',result='',failure='',expanded=true,ocrText='',editing=false;
export function clearPayslip() {
  job?.abort(); job=null;status='';result='';failure='';expanded=true;ocrText='';editing=false;
}
export function payslipCard() {
  return '<div class="panel ps-link"><button class="row" data-act="go" data-page="payslip"><span class="ico" style="--c:var(--ok)">'+I.file+'</span><div class="grow"><div class="t1">'+title+'</div><div class="t2">Начисления, удержания и сумма на руки</div></div>'+small(I.right,18)+'</button></div>';
}
function row(x,entry=false) {
  const [symbol,label]=labels[x.status];
  return '<li class="ps-row ps-'+x.status+'"><span class="ps-mark" aria-label="'+label+'">'+symbol+'</span><div><b>'+(entry?esc(x.code)+' · ':'')+esc(x.title)+'</b>'+
    (entry?' <strong>'+esc(rub(x.amount))+'</strong><small>'+esc(x.month)+'</small>':'')+'<p>'+esc(x.detail)+'</p></div></li>';
}
function report(sheet,ocr) {
  const raw=paySet(S.settings.pay,S.profile.role),profile={};
  for(const key of ['rk','sn','harm']) if(raw[key]!=null && raw[key]!=='' && Number.isFinite(+raw[key])) profile[key]=Number(raw[key]);
  if(sheet.period && raw.rates?.length) {
    const [m,y]=sheet.period.split(' '),rate=rateOn(raw,y+'-'+String(months.indexOf(m)+1).padStart(2,'0')+'-01');
    if(rate) profile.rate=rate;
  }
  const {checks,items}=auditPayslip(sheet,profile);
  const counts=Object.keys(labels).map(k=>[labels[k][1],checks.filter(x=>x.status===k).length]).filter(([,n])=>n);
  const totals=[['Начислено',sheet.gross],['Удержано и перечислено',sheet.deducted],['На руки',Number.isFinite(sheet.bank)&&Number.isFinite(sheet.cash)?sheet.bank+sheet.cash:null]];
  return '<section class="panel ps-panel"><h2>Листок'+(sheet.period?' за '+esc(sheet.period):'')+'</h2>'+
    (ocr?'<p class="ps-alert">Данные распознаны с изображения. Сверьте коды, часы и суммы с оригиналом.</p>':'')+
    '<dl class="ps-totals">'+totals.map(([k,v])=>'<div><dt>'+k+'</dt><dd>'+rub(v)+'</dd></div>').join('')+'</dl>'+
    '<h3>Проверки за месяц</h3><p>'+counts.map(([k,n])=>k+' · '+n).join(' / ')+'</p><ul>'+checks.map(x=>row(x)).join('')+'</ul></section>'+
    '<details id="ps-details" class="panel ps-panel" open><summary>Разбор по строкам ('+items.length+')</summary>'+
    Object.entries(groups).map(([k,label])=>{const list=items.filter(x=>x.kind===k);return list.length?'<h3>'+label+'</h3><ul>'+list.map(x=>row(x,true)).join('')+'</ul>':'';}).join('')+'</details>'+
    '<p class="hint">Проверка охватывает суммы, которые удалось прочитать. Для сверки пропущенных выплат и фактически отработанных часов нужны табель и данные поездок.</p>';
}
export function renderPayslip() {
  const draft=document.querySelector('#ps-correction');
  if(editing && draft) ocrText=draft.value;
  const existing=document.querySelector('#ps-details');
  if(existing) expanded=existing.open;
  return pageHead(title,{back:true})+'<section class="panel ps-panel"><h2>Загрузите листок</h2><p>Выберите PDF формы ФТУ-69 или чёткие фотографии всех страниц одного месяца. Расчёт выполняется на этом устройстве.</p>'+
    '<p class="ps-alert">'+small(I.shield,18)+' Перед загрузкой закройте ФИО, табельный номер и реквизиты. Оставьте видимыми месяц, тариф и таблицы.</p>'+
    '<label class="btn btn-primary ps-upload">Выбрать PDF или фото<input aria-label="Выбрать PDF или фото" id="ps-files" type="file" accept="application/pdf,image/*" multiple></label>'+
    '<div role="status" class="hint">'+esc(status||failure)+'</div></section>'+
    (ocrText?'<section class="panel ps-panel">'+(editing?'<label for="ps-correction">Сверьте текст с оригиналом. В кодах строк распознавание может перепутать букву L и цифру 1.</label><textarea id="ps-correction" rows="9">'+esc(ocrText)+'</textarea><button class="btn btn-primary" data-act="ps-apply">Пересчитать</button>':'<button class="btn btn-ghost" data-act="ps-edit">Исправить распознавание</button>')+'</section>':'')+(expanded?result:result.replace('class="panel ps-panel" open','class="panel ps-panel"'));
}
export async function loadPayslip(files,refresh) {
  if(!files.length) return;
  clearPayslip();const controller=new AbortController();job=controller;
  const update=s=>{if(job===controller){status=s;refresh();}};
  try {
    update('Открываем файл…');
    const {text,usedOCR}=await readPayslip(files,update,controller.signal);
    if(job!==controller) return;
    if(usedOCR) ocrText=text;
    const sheet=parsePayslip(text);
    if(!sheet.rows.length) throw Error('Не удалось прочитать строки формы ФТУ-69. Попробуйте исходный PDF или более чёткое фото таблицы.');
    result=report(sheet,usedOCR);
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

export function payslipAction(act,refresh) {
  if(act==='ps-edit') { editing=true;refresh();document.querySelector('#ps-correction')?.focus();return true; }
  if(act!=='ps-apply') return false;
  ocrText=document.querySelector('#ps-correction')?.value ?? ocrText;
  try {
    const sheet=parsePayslip(ocrText);
    if(!sheet.rows.length) throw Error('Проверьте строки с месяцем, кодом и суммой.');
    result=report(sheet,true); editing=false;failure='';expanded=true;
  } catch(e) {failure=e.message;result='';}
  refresh();return true;
}
