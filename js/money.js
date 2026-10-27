// Скрытие сумм, как в банковских приложениях: значок-глаз или телефон экраном вниз (ещё раз — суммы снова видны).
// Положение телефона читается только здесь, в браузере, и никуда не сохраняется и не отправляется.
import { S, saveSettings } from './store.js';
import { I, small, toast } from './ui.js';

export const moneyHidden = () => !!S.settings.hideMoney;
// значок-глаз рядом с суммой: скрыть или показать все суммы
export const eyeBtn = () => `<button class="eye-btn" data-act="money-eye" aria-pressed="${moneyHidden()}" aria-label="${moneyHidden() ? 'Показать суммы' : 'Скрыть суммы'}">${small(moneyHidden() ? I.eyeOff : I.eye, 18)}</button>`;
export function applyMoney() { document.documentElement.classList.toggle('money-off', moneyHidden()); }
export async function toggleMoney(flip = false) {
  const hide = !moneyHidden();
  document.documentElement.classList.toggle('money-off', hide); // сразу, не дожидаясь сохранения
  await saveSettings({ hideMoney: hide });
  if (flip) {
    try { navigator.vibrate?.(40); } catch {}
    toast(hide ? 'Суммы скрыты' : 'Суммы видны');
  }
}

// На iPhone датчик доступен только после разрешения, поэтому там переворот включается вручную в Настройках
const needsPermission = () => typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function';
export const flipOn = () => S.settings.flipHide ?? !needsPermission();

const DOWN_MS = 300; // столько телефон должен лежать экраном вниз, чтобы это не было случайным поворотом
let listening = false;
let armed = true;
let timer = 0;
function onOrient(e) {
  if (!flipOn()) return;
  const b = e.beta; const g = e.gamma;
  if (b == null || g == null) return;
  if (Math.abs(b) > 150 && Math.abs(g) < 35) { // экраном вниз
    if (armed && !timer) timer = setTimeout(() => { timer = 0; armed = false; toggleMoney(true); }, DOWN_MS);
  } else {
    clearTimeout(timer); timer = 0;
    if (Math.abs(b) < 120) armed = true; // подняли — следующий переворот снова сработает
  }
}
function listen() {
  if (listening || typeof window.DeviceOrientationEvent === 'undefined') return;
  listening = true;
  window.addEventListener('deviceorientation', onOrient);
}
async function permit() {
  if (!needsPermission()) return true;
  try { return (await DeviceOrientationEvent.requestPermission()) === 'granted'; } catch { return false; }
}

// При запуске. На iPhone разрешение просим только у тех, кто сам включил переворот, — при первом нажатии
export function initMoney() {
  applyMoney();
  if (!flipOn()) return;
  if (!needsPermission()) { listen(); return; }
  const once = async () => { document.removeEventListener('click', once, true); if (await permit()) listen(); };
  document.addEventListener('click', once, true);
}

// Переключатель в Настройках (нажатие — нужно iPhone для разрешения)
export async function setFlip(on) {
  if (on && !(await permit())) { toast('Нет доступа к положению телефона. Разрешите «Движение и ориентация» в настройках Safari'); return false; }
  await saveSettings({ flipHide: on });
  if (on) listen();
  return true;
}
