// ФТУ-69. В справках первое значение — за месяц, второе — с начала года.
export const months = 'январь февраль март апрель май июнь июль август сентябрь октябрь ноябрь декабрь'.split(' ');
const monthPattern = months.join('|');
const rowPeriod = monthPattern + '|\\d{2,4}\\s+г\\.?';
const monthStart = new RegExp('^('+rowPeriod+')\\s','i');
const periodHeader = new RegExp('листок за ('+monthPattern+')\\s+(?:месяц\\s+)?(20\\d{2})','i');
const secondColumn = new RegExp('\\s+(?=(?:'+rowPeriod+')\\s)','i');
const codes = /(?:^|\s)(\d{3}[A-ZА-ЯЁ0-9]?|[CEСЕ]073)(?=\s|$)/giu;
const numbers = /[-−]?(?:\d{1,3}(?:[. ]\d{3})+|\d+),\d{2}(?!\d)/g;
const money = s => Number(s.replace(/[. ]/g,'').replace(',','.').replace('−','-'));
const amounts = s => Array.from(s.matchAll(numbers), m => money(m[0]));
const letters = {А:'A',В:'B',С:'C',Е:'E',Н:'H',К:'K',М:'M',О:'O',Р:'P',Т:'T',Х:'X'};
const fields = {
  rate: /оклад\s*[/|]\s*тариф/i, norm: /норма часов\s*\(по закону\)/i,
  worked: /всего отработано часов за месяц/i, gross: /всего начислено/i,
  deducted: /всего удержано и перечислено/i, cash: /к выплате через кассу/i,
  bank: /к перечислению через банк/i, inKind: /всего доходов в натуральной форме/i,
  income: /^доход\s+(?=[\d−-])/i, taxable: /доход,\s*облагаемый ндфл/i,
  pensionBase: /^облагаемая база\s+(?=[\d−-])/i, insurance: /^страховой взнос/i,
};
function addEntry(part, section, sheet) {
  const month = part.match(monthStart);
  if (!month) return;
  const match = Array.from(part.matchAll(codes)).find(m => amounts(part.slice(m.index+m[0].length)).length);
  if (!match) { sheet.unread++; return; }
  const code = match[1].toUpperCase().replace(/[АВСЕНКМОРТХ]/g,c=>letters[c]);
  const rest = part.slice(match.index+match[0].length).split(/к (?:перечислению|выплате)|всего удержано/i)[0].trim();
  const vals = amounts(rest), hours = rest.match(/([-−]?\d+,\d{2})\s*\//);
  if (!vals.length || !/\d,\d{2}$/.test(rest)) { sheet.unread++; return; }
  // Форма печатает дни справа от косой черты, часы слева. Отпускные
  // и больничные используют дни, а в почасовых строках дальше бывает процент.
  const dayField = rest.match(/^\s*\/\s*([-−]?\d+,\d{2})(?=\s)/);
  sheet.rows.push({
    code, month:month[1].toLowerCase(), name:part.slice(month[0].length,match.index).trim(),
    amount:vals.at(-1), hours:hours ? money(hours[1]) : null,
    days:dayField ? money(dayField[1]) : null,
    pct:!dayField && vals.length > (hours ? 2 : 1) ? vals.at(-2) : null,
    kind:section==='natural' ? 'natural' : /^[89]/.test(code) ? 'deductions' : 'earnings',
  });
}
function readTax(line,sheet) {
  const vals=amounts(line);
  if (!vals.length) return;
  if (/^вычет/i.test(line)) sheet.deductions.push(vals[0]);
  const rate=line.match(/(\d{1,2})\s*%/);
  if (!rate) return;
  const kind=/рк\s*и\s*сн/i.test(line)?'regional':'main';
  const key=/налоговая база/i.test(line)?'base':/(исчисл|ис\.)/i.test(line)?'calculated':/(удерж|уд\.)/i.test(line)?'withheld':null;
  if (!key) return;
  let group=sheet.taxes.find(x=>x.kind===kind && x.pct===+rate[1]);
  if (!group) { group={kind,pct:+rate[1]}; sheet.taxes.push(group); }
  group[key]=vals[0]; group[key+'Year']=vals[1];
}
export function parsePayslip(text) {
  const sheet={rows:[],taxes:[],deductions:[],unread:0};
  let section='earnings', lastRow=null;
  for (let line of text.split(/\r?\n/)) {
    line=line.replace(/\s+/g,' ').trim();
    // Узкая колонка удержаний переносит мягкий знак месяца на следующую строку.
    line=line.replace(/(^|\s)(январ|феврал|апрел|июн|июл|сентябр|октябр|ноябр|декабр)(?=\s)/gi,'$1$2ь');
    if (!line) continue;
    const period=line.match(periodHeader);
    if (period) {
      const name=period[1].toLowerCase()+' '+period[2];
      if (sheet.period && sheet.period!==name) throw Error('Выберите страницы одного месяца.');
      sheet.period=name; continue;
    }
    for (const [key,pattern] of Object.entries(fields)) {
      const m=line.match(pattern);
      if(m && sheet[key]==null) sheet[key]=amounts(line.slice(m.index+m[0].length))[0] ?? null;
    }
    if (/^доходы в натуральной форме/i.test(line)) section='natural';
    if (/справочно ндфл/i.test(line)) section='tax';
    if (section==='tax') { readTax(line,sheet); continue; }
    const before=sheet.rows.length;
    for(const part of line.split(secondColumn)) addEntry(part,section,sheet);
    if(sheet.rows.length>before) lastRow=sheet.rows[before];
    else if(lastRow && /^[а-яёa-z0-9_%.,*()/-]{2,40}$/i.test(line)) lastRow.name+=line;
    else lastRow=null;
  }
  return sheet;
}
