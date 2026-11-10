// Профиль гостя (2.26, решение Никиты 10.11.2026, по его макету): кто без аккаунта, видит в «Профиле» не персонажа и награды,
// а что даёт аккаунт, кнопки «Зарегистрироваться» / «Войти» и честно — что CABINA за человеком не следит.
// Основное (поездки, часы, отдых, заработок, статистика, обучение) работает без аккаунта, как раньше.
// Ничего не стирается: персонаж остаётся в профиле, награды считаются из поездок — после входа всё на месте.
// Тексты — коротко (просьба Никиты: «люди боятся много читать»). Обещаем только то, что уже есть.
// «Мы за вами не следим» — правда: геолокации в приложении нет, поездки, номер поезда и точное время явки на сервер
// не уходят никогда (auth.js, colleagues.js), статус коллегам — только тем, кому человек сам его откроет.
import { I, esc, small, pageHead, plural } from './ui.js';
import { S } from './store.js';
import { computeAwards, AWARDS, MEDALS_TOTAL } from './awards.js';
import { hasAvatar } from './avatar-edit.js';
import { SIGNUP_OPEN } from './legal.js';

// Сколько наград (ступеней) человек уже заработал своими поездками — они ждут его в аккаунте
export const guestMedals = () => { const { aw } = computeAwards(); return AWARDS.reduce((s, a) => s + aw[a.id].tier, 0); };
const medalsText = (n) => `${n} ${plural(n, 'награда', 'награды', 'наград')}`;
const medalsAcc = (n) => `${n} ${plural(n, 'награду', 'награды', 'наград')}`; // «заработали 1 награду»

const startBtns = (cls = '') => `<div class="gp-btns${cls}">
    <button class="btn btn-primary" data-act="acc-start" data-mode="signup" id="gp-signup">Зарегистрироваться</button>
    <button class="btn btn-ghost gp-login" data-act="acc-start" data-mode="login" id="gp-login">Войти</button></div>`;

export const TRUST_HTML = `<div class="notice ok gp-trust" id="gp-trust">${I.shield}<div><b>Мы за вами не следим.</b> Геолокации нет. Поездки, номер поезда и точное время явки остаются в телефоне. Статус видят только те, кому вы сами его откроете.</div></div>`;

const perk = (id, icon, color, t1, t2, hot = false) => `<div class="row gp-perk" id="${id}"><span class="ico" style="--c:var(--${color})">${icon}</span>
  <div class="grow"><div class="t1">${t1}</div><div class="t2${hot ? ' gp-hot' : ''}">${t2}</div></div></div>`;

export function guestProfileHtml() {
  const n = guestMedals();
  const ava = hasAvatar();
  return `${pageHead('Профиль', { right: `<button class="icon-btn" data-act="go" data-page="settings" aria-label="Настройки">${I.gear}</button>` })}
    <div class="pr-page gp-page">
    <section class="gp-hero" id="gp-hero">
      <h2>Ваша CABINA — больше возможностей</h2>
      <p>Коллеги, награды и свой персонаж — в одном аккаунте.</p>
      ${startBtns()}
      <div class="gp-free">${SIGNUP_OPEN ? 'Бесплатно' : 'Бесплатно, по приглашению коллеги'}</div>
    </section>
    <div class="group"><div class="group-title">С аккаунтом</div>
      <div class="panel gp-perks" id="gp-perks">
        ${perk('gp-awards', I.medal, 'warn', 'Награды и рекорды', n ? `Уже заработано: ${medalsText(n)} — ${n % 10 === 1 && n % 100 !== 11 ? 'ждёт' : 'ждут'} вас` : `${MEDALS_TOTAL} наград за вашу работу`, n > 0)}
        ${perk('gp-avatar', I.face, 'accent', 'Свой персонаж', ava ? 'Ваш персонаж сохранён — ждёт вас' : 'Лицо, причёска, форма и фон', ava)}
        ${perk('gp-team', I.users, 'ok', 'Коллеги', 'Кто в пути, на отдыхе или дома')}
        ${perk('gp-groups', I.grid, 'night', 'Группы депо', 'Своя группа для бригады и депо')}
        ${perk('gp-gifts', I.gift, 'warn', 'Вещи за приглашения', 'Кожанка, ушанка, китель машиниста')}
      </div></div>
    ${TRUST_HTML}
    <div class="panel">
      <button class="row" data-act="inv-guest" id="inv-guest"><span class="ico" style="--c:var(--warn)">${I.gift}</span>
        <div class="grow"><div class="t1">Пригласить коллег</div><div class="t2">Отправьте ссылку на CABINA</div></div>${small(I.right, 18)}</button>
      <button class="row" data-act="go" data-page="profile-edit" id="gp-edit"><span class="ico" style="--c:var(--night)">${I.briefcase}</span>
        <div class="grow"><div class="t1">Должность, депо и стаж</div><div class="t2">Для расчёта заработка, только в телефоне</div></div>${small(I.right, 18)}</button>
    </div>
    </div>`;
}

// Экраны наград, рекордов и персонажа для гостя: что там будет и кнопка регистрации. Само содержимое не трогаем.
const LOCKS = {
  awards: { title: 'Награды', icon: I.medal, c: 'warn', h: 'Награды — с аккаунтом', p: (n) => (n ? `Вы уже заработали ${medalsAcc(n)}. Зарегистрируйтесь — и увидите ${n === 1 ? 'её' : 'их'}.` : 'За поездки, ночи, километры и технику. Зарегистрируйтесь — и начнёте собирать.') },
  records: { title: 'Рекорды', icon: I.medal, c: 'warn', h: 'Рекорды — с аккаунтом', p: () => 'Самая долгая и самая быстрая поездка, лучший месяц. Зарегистрируйтесь — и увидите свои.' },
  avatar: { title: 'Мой персонаж', icon: I.face, c: 'accent', h: 'Персонаж — с аккаунтом', p: () => (hasAvatar() ? 'Ваш персонаж сохранён. Войдите — и он снова с вами.' : 'Соберите себя: лицо, причёска, форма и фон.') },
};
export function guestLockHtml(kind) {
  const x = LOCKS[kind] || LOCKS.awards;
  return `${pageHead(x.title, { back: true })}
    <section class="gp-hero gp-lock" id="gp-lock">
      <span class="gp-lock-ico" style="--c:var(--${x.c})">${x.icon}<i>${small(I.lock, 16)}</i></span>
      <h2>${esc(x.h)}</h2>
      <p>${esc(x.p(kind === 'awards' ? guestMedals() : 0))}</p>
      ${startBtns()}
      <div class="gp-free">Бесплатно. Поездки остаются в телефоне.</div>
    </section>`;
}
