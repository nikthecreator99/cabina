// Правила, протокол СЖТ № 83, приложение 65. Приложение 2, таблицы 1 и 2.
// Строка табл. 1, категория, основная норма, скорости на спусках до 10/15‰,
// скорость в скобках, минимальная норма и три скорости при точном минимуме.
export const categories = [
  ['11','Грузовой гружёный или смешанный',33,80,70,90,28,70,70,60],
  ['11х','Хозяйственный поезд',33,80,70,0,28,70,70,60],
  ['9п','Порожний до 350 осей',55,100,90,0,50,90,90,80],
  ['15.1','Порожний 351–400 осей',44,90,80],
  ['15.2','Порожний 401–520 осей',33,80,70,90],
  ['13','Грузовой свыше 100 до 120 км/ч',60,100,100,120,52,110,100,90],
  ['14.2','Грузовой до 140 км/ч, пневматическое торможение',78,120,110,140,68,130,120,100],
  ['14.1','Грузовой до 140 км/ч, ЭПТ',78,140,130,0,68,130,125,115],
  ['12','Грузопассажирский',44,90,80,0,38,80,75,65],
  ['9р','Рефрижераторный до 100 км/ч',55,100,90,0,50,95,90,80],
  ['10','Рефрижераторный свыше 100 до 120 км/ч',60,120,100,0,50,110,100,90],
  ['1','Пассажирский до 120 км/ч',60,120,110,0,45,105,90,80],
  ['2','Пассажирский до 130 км/ч, ЭПТ',68,130,0,0,60,120,110,0],
  ['3','Пассажирский до 140 км/ч, ЭПТ',78,140,0,0,68,130,120,0],
  ['4','Пассажирский до 160 км/ч, ЭПТ',80,160,0,0,70,150,140,0],
  ['5','Пассажирский с вагонами РИЦ, пневматический тормоз до 140 км/ч',70,140,0],
  ['6','Пассажирский с вагонами РИЦ, пневматический тормоз до 160 км/ч',80,160,0],
  ['8','Скоростной до 200 км/ч, ЭПТ и дисковый магниторельсовый тормоз',120,200,0,0,80,160,150,0],
  ['7','Скоростной до 200 км/ч, ЭПТ и дисковый тормоз',95,200,0,0,80,160,150,0],
  ['15.3','Соединённый до 12,6 тыс. т, раздельные ТМ',33,60,60,0,28,50,50,50],
  ['15.4','До 12,6 тыс. т, локомотивы в голове и хвосте',33,75,65,85,28,65,50,50],
  ['15.5','Соединённый до 14,2 тыс. т, общая ТМ',33,75,65,80,28,55,55,50],
  ['15.6','До 16 тыс. т, локомотив в последней трети',33,70,65,80,28,60,60,55],
  ['15.7','Соединённый порожний до 800 осей',33,70,60,80,28,60,60,55],
];

export function number(value, integer = false) {
  const text = String(value ?? '').trim().replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) && (!integer || Number.isSafeInteger(n)) ? n : null;
}

export function effectiveRate(row) {
  const nominal = number(row.rate);
  if (!(nominal > 0)) return null;
  if (row.efficiency==='zero') return 0;
  return row.efficiency==='partial' ? nominal*2/3 : nominal;
}

export function totals(d) {
  if (d.mode === 'special') {
    const axes = number(d.axes, true);
    const weight = number(d.weight);
    const rate = number(d.acceptedRate);
    if (!(axes > 0 && weight > 0 && rate > 0) || !d.specialSource?.trim() || !d.specialChecked) return {};
    return { axes, force: weight * rate / 100 };
  }
  if (d.mode === 'total') return { force: number(d.force), axes: number(d.axes,true) };
  let axes = number(d.off || 0,true), force = 0;
  if (axes === null || !d.groups.length) return {};
  for (const row of d.groups) {
    const count = number(row.axes,true), rate = effectiveRate(row);
    if (!(count > 0) || rate == null) return {};
    axes += count;
    force += count * rate;
  }
  return { force, axes };
}

export function manualLoco(d) {
  const weight = number(d.locoWeight);
  const perAxle = number(d.locoRate);
  const axes = number(d.locoAxes, true);
  const brakeAxes = number(d.locoBrakeAxes, true);
  const handAxes = number(d.locoHandAxes, true);
  const force = d.locoMethod === 'rate' ? (perAxle == null || brakeAxes == null ? null : perAxle * brakeAxes) : number(d.locoForce);
  if (!(weight > 0 && axes > 0) || force == null || brakeAxes == null || handAxes == null ||
      brakeAxes > axes || handAxes > axes || (!brakeAxes && force > 0)) return null;
  return {weight, force, axes};
}

export function allowsSeparateLoco(category) {
  return ['1','2','3','4','5','6','7','8','12','10','11х'].includes(category);
}

export function assessment(d) {
  const wagons = totals(d);
  const wagonWeight = number(d.weight);
  const separateLoco = d.includeLoco && d.mode !== 'special';
  if (separateLoco && !allowsSeparateLoco(d.category)) return {};
  const loco = separateLoco ? manualLoco(d) : {weight:0, force:0, axes:0};
  if (!loco || !(wagonWeight > 0) || wagons.force == null || !(wagons.axes > 0)) return {};
  const weight = wagonWeight + loco.weight, force = wagons.force + loco.force;
  const axes = wagons.axes + loco.axes;
  const cat = categories.find(([key]) => key === d.category);
  if (!cat || !(weight > 0) || force == null || !(axes > 0)) return {};
  const [, , norm, level, steep, green, minimum] = cat;
  const localNorm = number(d.localNorm);
  const percent = number(d.composition);
  const allBrakes = d.mode!=='groups' || (!number(d.off) && d.groups.every(g=>g.efficiency!=='zero'));
  const heavyCase = allBrakes && d.mode!=='special' && d.category==='11' && d.heavyAxle && percent != null && percent<=100 && percent>=50;
  const selectedNorm = localNorm ?? (heavyCase ? percent===100 ? 30 : percent>=75 ? 31 : 32 : norm);
  if (d.localNorm && !(localNorm > 0)) return {};
  if (!Number.isFinite(force) || !Number.isFinite(weight)) return {};
  // Убираем машинную погрешность отношения на точной табличной границе.
  const pressure = Number((force * 100 / weight).toPrecision(15));
  if (!Number.isFinite(pressure)) return {};
  const required = weight * selectedNorm / 100;
  if (!Number.isFinite(required)) return {};
  const grade = number(d.grade), result = { weight, force, axes, pressure, required };
  if (d.mode === 'special' || d.localNorm || grade === null || grade > 15 || (!steep && grade > 10)) return result;
  const passenger = ['1','2','3','4','5','6','7','8'].includes(d.category);
  if (!passenger && !['three','four'].includes(d.blockSystem)) return result;
  const combined = ['15.3','15.4','15.5','15.6','15.7'].includes(cat[0]);
  if (combined && grade > 12 && (cat[0] !== '15.7' || pressure < norm)) return result;
  if (combined && !d.weakest) return result;
  if ((cat[0] === '9п' && axes > 350) || (cat[0] === '15.1' && (axes < 351 || axes > 400)) ||
      (cat[0] === '15.2' && (axes < 401 || axes > 520)) || (cat[0] === '15.7' && axes > 800)) return result;
  const maxMass = {'15.3':12600,'15.4':12600,'15.5':14200,'15.6':16000}[cat[0]];
  if (maxMass && weight > maxMass) return result;
  const base = grade > 10 ? steep : level;
  const highSpeed = ['7','8'].includes(d.category);
  const failureReduction = !d.eptFailure ? 0 : highSpeed ? 20 : ['2','3','4','14.1'].includes(d.category) ? 10 : 0;
  const signalCap = !passenger && !(d.blockSystem === 'three' && d.green) && green ? base : Infinity;
  if (heavyCase && pressure < norm) {
    if (pressure < selectedNorm) return result;
    const max = percent===100 && d.symmetric && d.green && d.blockSystem==='three' ? 85 : 80;
    return {...result,speed:Math.min(max,grade>10 ? steep : max)};
  }
  if (pressure >= norm) {
    const useGreen = grade <= 10 && d.blockSystem === 'three' && d.green && green;
    return {...result, speed:(useGreen ? green : base) - failureReduction};
  }
  if (!d.exception || !minimum || pressure < minimum) return result;
  const band = grade <= 6 ? 0 : grade <= 10 ? 1 : 2;
  if (pressure === minimum) return { ...result, speed: cat[7 + band] ? Math.min(signalCap,cat[7 + band] - failureReduction) : null };
  const factor = highSpeed ? 1 : (grade > 6 || ['11','11х'].includes(cat[0]) || combined ? 2 : 1);
  const step = highSpeed ? 10 : 5;
  return { ...result, speed: Math.min(signalCap, Math.floor((base - failureReduction - factor * (norm - pressure)) / step) * step) };
}

// Таблица 4 Правил, п. 9.3.3. Составы с локомотивами в голове.
const densityRows = [
  [1000,58,40,29,25,23,20,17,15,13,11],[1200,69,46,34,29,25,22,20,18,15,13],
  [1500,80,58,46,34,31,26,23,21,17,15],[1800,98,69,52,46,38,33,29,26,22,20],
  [2000,104,75,58,52,40,36,32,29,24,22],[2500,129,93,71,64,51,45,40,36,30,28],
  [3000,207,138,102,87,75,66,60,51,45,33]
];
export function density(volume, axes, high) {
  const row = densityRows.filter(([v]) => v <= volume).pop();
  const col = [100,150,200,250,300,350,400,450,480,530].findIndex(limit => axes <= limit);
  return row && axes > 0 && col >= 0 ? row[col+1] * (high ? 0.9 : 1) : null;
}

// Приложение 2 к Правилам № 83, раздел 7 и табл. 4.
// Коэффициенты передаются из общей таблицы закрепления.
export function holding(d, table) {
  if (!categories.some(([id]) => id === d.category)) return {};
  if (['1','2','3','4','5','6','7','8'].includes(d.category)) return { passenger:true };
  const slope = number(d.slope);
  if (slope == null) return {};
  if (!d.multi || slope > 12) return { local:true };
  if (d.mode === 'special') return {};
  const weight = number(d.weight), { axes } = totals(d);
  const row = table.find(([grade]) => grade === slope);
  if (!(weight > 0 && axes > 0) || !row) return {};
  const roundUp = n => Math.ceil(Number(n.toPrecision(15)));
  return {
    shoes:roundUp(weight * (weight/axes >= 10 ? row[1] : row[2]) / 100),
    manual:roundUp(weight * Math.max(0.6,row[3]) / 100)
  };
}
