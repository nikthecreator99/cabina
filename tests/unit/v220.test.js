// CABINA 2.20: личные приглашения (вещи персонажа за 1 / 5 / 10, награда «Наставник»), «Идеи» (награда «Идейный»),
// плашка «кто из коллег в пути» и новая редакция согласия privacy-3. Данные выдуманные.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const { S } = await import('../../js/store.js');
const A = await import('../../js/avatar.js');
const { computeAwards, countOf, noteCount, AWARDS, awardArt } = await import('../../js/awards.js');
const { inviteFromHash, inviteUrl, rememberInvite, savedInvite, forgetInvite, errorText } = await import('../../js/auth.js');
const { cleanMine, nagDue, inviteText, inviteError, NAG_WEEK, NAG_SNOOZE, NAG_TRIPS } = await import('../../js/invites.js');
const { cleanIdeas, ideaText, ideaError, IDEA_MAX } = await import('../../js/ideas.js');
const { CONSENT_VERSION, SERVER_DATA, consentHtml, policyHtml } = await import('../../js/legal.js');
const { myDataHtml } = await import('../../js/colleagues.js');

beforeEach(() => { mem.clear(); S.trips = []; S.routes = []; S.profile = { id: 'profile' }; });
const DAY = 864e5;

// Рисунки вещей делает поток «Конструктор аватаров» (с 2.19.6 уже в списках); если вещи нет — подкладываем на время теста
function withItems(fn) {
  const add = [[A.HATS, { id: 'ushanka', name: 'Ушанка', reward: true }], [A.HATS, { id: 'retro', name: 'Фуражка паровозника', reward: true }],
    [A.OUTFITS, { id: 'kitel', name: 'Китель паровозника', reward: true }]].filter(([list, x]) => !list.some((y) => y.id === x.id));
  for (const [list, x] of add) list.push(x);
  try { return fn(); } finally { for (const [list, x] of add) list.splice(list.indexOf(x), 1); }
}

test('вещи за приглашения: 1 — фон «Прожектор», 3 — кожанка, 5 — ушанка, 10 — китель и фуражка (решения Никиты 01.11)', () => {
  assert.deepEqual(A.REWARD_TIERS.map((t) => t.n), [1, 3, 5, 10]);
  assert.deepEqual(A.REWARD_TIERS.map((t) => t.title), ['Напарник', 'Сменщик', 'Бригада', 'Машинист-инструктор']);
  assert.deepEqual(A.REWARDS.map((r) => [r.k, r.id, r.n]), [['bg', 'beam', 1], ['outfit', 'leather', 3], ['hat', 'ushanka', 5], ['outfit', 'kitel', 10], ['hat', 'retro', 10]]);
  for (const r of A.REWARDS) assert.ok(A.rewardReady(r), `${r.id} нарисована`);
  for (const r of A.REWARDS) assert.ok(A.REWARD_TIERS.some((t) => t.n === r.n), r.id);
});

test('неоткрытая вещь снимается при сохранении и для коллег; открытая остаётся без Премиума; Премиум (разработчик) — всё', () => withItems(() => {
  const a = { hat: 'ushanka', outfit: 'kitel', bg: 'sky' };
  assert.deepEqual(A.lockedRewards(A.normalizeAvatar(a, { premium: true }), 4).map((r) => r.id), ['ushanka', 'kitel']);
  let o = A.normalizeAvatar(a, { invited: 4 });
  assert.equal(o.hat, null); assert.equal(o.outfit, 'vestO'); assert.equal(o.bg, 'sky');
  o = A.normalizeAvatar(a, { invited: 5 });
  assert.equal(o.hat, 'ushanka'); assert.equal(o.outfit, 'vestO');
  o = A.normalizeAvatar({ ...a, hat: 'retro' }, { invited: 10 });
  assert.equal(o.hat, 'retro'); assert.equal(o.outfit, 'kitel');
  o = A.normalizeAvatar(a, { premium: true });
  assert.equal(o.hat, 'ushanka'); assert.equal(o.outfit, 'kitel');
  // по умолчанию — ничего не открыто; чужое значение счёта ничего не открывает
  for (const bad of [undefined, -1, '10', NaN, null]) assert.equal(A.normalizeAvatar(a, { invited: bad }).hat, null, String(bad));
}));

test('«Случайный» не надевает ни Премиум, ни вещи за приглашения', () => withItems(() => {
  const rnd = A.rng(42);
  for (let i = 0; i < 400; i++) {
    const x = A.randomAvatar(rnd);
    assert.ok(!['ushanka', 'retro', 'peaked'].includes(x.hat), x.hat);
    assert.notEqual(x.outfit, 'kitel');
  }
}));

test('фон и кожанка: без приглашений снимаются, с ними остаются; шарфа больше нет', () => {
  let o = A.normalizeAvatar({ bg: 'beam', outfit: 'leather', scarf: 'light' });
  assert.equal(o.bg, 'mist'); assert.equal(o.outfit, 'vestO'); assert.equal(o.scarf, undefined, 'шарфа больше нет');
  o = A.normalizeAvatar({ bg: 'beam', outfit: 'leather', scarf: 'light' }, { invited: 1 });
  assert.equal(o.bg, 'beam'); assert.equal(o.outfit, 'vestO'); assert.equal(o.scarf, undefined);
  o = A.normalizeAvatar({ bg: 'beam', outfit: 'leather' }, { invited: 3 });
  assert.equal(o.bg, 'beam'); assert.equal(o.outfit, 'leather');
  const rnd = A.rng(7);
  for (let i = 0; i < 300; i++) { const x = A.randomAvatar(rnd); assert.notEqual(x.bg, 'beam'); assert.notEqual(x.outfit, 'leather'); }
});

test('счёт засчитанных в телефоне: только целое число, только растёт; дни ступеней «Наставника»', async () => {
  assert.deepEqual(countOf('invited'), { n: 0, days: [] });
  assert.equal(await noteCount('invited', 1, '2026-11-02'), true);
  assert.equal(await noteCount('invited', 1, '2026-11-03'), false, 'то же число — без изменений');
  assert.equal(await noteCount('invited', 0, '2026-11-03'), false, 'меньше — не уменьшаем: коллега удалил аккаунт, награда остаётся');
  assert.equal(await noteCount('invited', 6, '2026-11-20'), true);
  assert.deepEqual(countOf('invited'), { n: 6, days: ['2026-11-02', '2026-11-20'] });
  for (const bad of [1.5, '7', -3, 1e9]) assert.equal(await noteCount('invited', bad, '2026-11-21'), false, String(bad));
  assert.equal(await noteCount('trips', 5, '2026-11-21'), false, 'чужой ключ не принимается');
  assert.equal(await noteCount('invited', 7, '21.11.2026'), false, 'день — только ГГГГ-ММ-ДД');
  const { aw, c } = computeAwards();
  assert.equal(c.invited, 6);
  assert.equal(aw.mentor.tier, 2);
  assert.deepEqual(aw.mentor.days, ['2026-11-02', '2026-11-20']);
});

test('из резервной копии — непроверенное: странные значения не дают наград', () => {
  for (const bad of [{ n: '10' }, { n: -1 }, { n: 2.5 }, 'много', [10], { n: 1e9 }]) {
    S.profile.invited = bad;
    assert.equal(computeAwards().aw.mentor.tier, 0, JSON.stringify(bad));
  }
  S.profile.ideas = { n: 3, days: ['<img src=x>', '2026-11-05'] };
  const { aw } = computeAwards();
  assert.equal(aw.idea.tier, 2);
  assert.ok(aw.idea.days.every((d) => d === '2026-11-05'), 'чужая строка вместо даты отброшена');
});

test('награды «Наставник» (1 / 5 / 10) и «Идейный» (1 / 3 / 10) — в «Особых», с рисунками', () => {
  const m = AWARDS.find((a) => a.id === 'mentor');
  const i = AWARDS.find((a) => a.id === 'idea');
  assert.deepEqual([m.g, m.goals, i.g, i.goals], ['special', [1, 5, 10], 'special', [1, 3, 10]]);
  for (const id of ['mentor', 'idea']) for (const t of [0, 1, 2, 3]) assert.match(awardArt(id, 64, t), /<svg[\s\S]*<\/svg>/);
});

test('ссылка-приглашение: код после «#», только буквы и цифры; странное — не код', () => {
  assert.equal(inviteFromHash('#invite=7f3a9c21b4'), '7F3A9C21B4');
  assert.equal(inviteFromHash('invite=7F3A9-C21B4'), '7F3A9C21B4');
  for (const bad of ['', '#t=abc', '#invite=', '#invite=abc', '#invite=<script>alert(1)</script>', '#invite=7F3A9C21B4&x=1', '#access_token=abc', '#invite=' + 'A'.repeat(41)]) {
    assert.equal(inviteFromHash(bad), null, bad);
  }
  assert.equal(inviteUrl('7F3A9C21B4', { origin: 'https://cabina-app.ru', pathname: '/' }), 'https://cabina-app.ru/#invite=7F3A9C21B4');
});

test('код из ссылки помнится в телефоне до регистрации, не дольше 14 дней', () => {
  assert.equal(savedInvite(), '');
  rememberInvite('7F3A9C21B4');
  assert.equal(savedInvite(), '7F3A9C21B4');
  assert.equal(savedInvite(Date.now() + 15 * DAY), '', 'старше 14 дней — забыт');
  rememberInvite('7F3A9C21B4');
  forgetInvite();
  assert.equal(savedInvite(), '');
  rememberInvite('<b>bad</b>');
  assert.equal(savedInvite(), '', 'чужое не сохраняется');
});

test('ответ my_invites проверяется: только известные поля, кода в нём нет', () => {
  const id = '11111111-2222-4333-8444-555555555555';
  const d = cleanMine({ open: [{ id, created_at: '2026-11-01T05:00:00Z', expires_at: '2026-11-15T05:00:00Z', code: 'SECRET' }, { id: 'не id', expires_at: '2026-11-15T05:00:00Z' }, null],
    joined: 3, counted: 2, limit: 10, need_days: 3, extra: '<script>' });
  assert.equal(d.open.length, 1);
  assert.deepEqual(Object.keys(d.open[0]).sort(), ['created', 'expires', 'id']);
  assert.deepEqual([d.joined, d.counted, d.limit, d.needDays], [3, 2, 10, 3]);
  const bad = cleanMine({ joined: '5', counted: -1, limit: 0, need_days: 'x' });
  assert.deepEqual([bad.joined, bad.counted, bad.limit, bad.needDays, bad.open.length], [0, 0, 10, 3, 0]);
  assert.deepEqual(cleanMine(null).open, []);
});

test('текст приглашения: ссылка и код для ручного ввода, срок и «один человек»', () => {
  const t = inviteText('7F3A9C21B4', 'https://cabina-app.ru/#invite=7F3A9C21B4');
  assert.match(t, /https:\/\/cabina-app\.ru\/#invite=7F3A9C21B4/);
  assert.match(t, /код приглашения: 7F3A9C21B4/);
  assert.match(t, /14 дней и только для одного человека/);
  assert.doesNotMatch(t, /РЖД/);
});

test('понятные ошибки приглашений и идей', () => {
  assert.match(inviteError(null), /Нет связи/);
  assert.match(inviteError({ status: 404, data: {} }), /ещё не включены/);
  assert.match(inviteError({ status: 400, data: { message: 'cabina: limit' } }, 10), /уже 10/);
  assert.match(inviteError({ status: 400, data: { message: 'cabina: consent required' } }), /редакцию согласия/);
  assert.match(errorText({ status: 400, data: { message: 'cabina: email not confirmed' } }), /подтвердите почту/);
  assert.match(ideaError({ status: 400, data: { message: 'cabina: limit' } }), /не больше 5 в день/);
  assert.match(ideaError({ status: 400, data: { message: 'cabina: empty' } }), /несколько слов/);
  assert.match(ideaError({ status: 400, data: { code: 'PGRST202' } }), /ещё не включены/);
});

test('идеи с сервера проверяются; текст без служебных символов и не длиннее 500', () => {
  const id = '11111111-2222-4333-8444-555555555555';
  const list = cleanIdeas([{ id, body: 'Виджет\nс отдыхом', state: 'accepted', created_at: '2026-11-01T05:00:00Z', answered_at: null },
    { id: 'x', body: 'чужое', state: 'new' }, { id, body: 'ok ok', state: 'hacked' }, { id, body: '   ', state: 'new' }, null]);
  assert.equal(list.length, 1);
  assert.equal(list[0].body, 'Виджет с отдыхом');
  assert.equal(ideaText('  a\u0000b\t\tc  '), 'a b c');
  assert.equal(ideaText('я'.repeat(800)).length, IDEA_MAX);
});

test('плашка «кто из коллег в пути»: от 5 поездок, весь день показа, потом раз в неделю; «Не сейчас» — месяц; «Больше не показывать»', () => {
  const now = Date.parse('2026-11-10T09:00:00Z');
  assert.equal(nagDue({}, now, NAG_TRIPS - 1), false, 'мало поездок — рано');
  assert.equal(nagDue({}, now, NAG_TRIPS), true);
  assert.equal(nagDue({ shown: now - 3600e3 }, now, 9), true, 'в день показа — остаётся');
  assert.equal(nagDue({ shown: now - 2 * DAY }, now, 9), false, 'через два дня — нет');
  assert.equal(nagDue({ shown: now - NAG_WEEK }, now, 9), true, 'через неделю — снова');
  assert.equal(nagDue({ snooze: now + NAG_SNOOZE - 1 }, now, 9), false);
  assert.equal(nagDue({ off: true }, now, 999), false);
  assert.equal(NAG_SNOOZE, 30 * DAY);
});

test('согласие (с 2.20, privacy-3 и дальше): приглашения, идеи, число дней захода — названы прямо; пригласивший видит только числа', () => {
  assert.match(CONSENT_VERSION, /^privacy-[3-9]$/);
  const all = SERVER_DATA.join(' ');
  assert.match(all, /число разных дней.*без самих дат/);
  assert.match(all, /по чьему приглашению/);
  assert.match(all, /мои идеи/);
  const c = consentHtml().replace(/<[^>]+>/g, ' ');
  assert.match(c, /личные приглашения/);
  assert.match(c, /пригласившему предоставляются только числа/);
  assert.match(c, /без моей почты, имени и дат входа/);
  assert.match(c, /Идеи читает только Оператор/);
  const p = policyHtml().replace(/<[^>]+>/g, ' ');
  assert.match(p, /Личные приглашения/);
  assert.match(p, /Идеи по улучшению CABINA/);
  assert.match(p, /отменить приглашение и стереть свою идею/);
});

test('«Что сервер знает о вас»: приглашения (только числа), как пришли, идеи — экранированы', () => {
  const html = myDataHtml({
    email: 'ivan@example.com', active_days: 4, invited_by: '11111111-2222-4333-8444-555555555555',
    invites: { open: [{ created_at: '2026-11-01T05:00:00Z', expires_at: '2026-11-15T05:00:00Z' }], joined: 2, counted: 1 },
    ideas: [{ body: 'Напоминание <script>alert(1)</script>', state: 'accepted', created_at: '2026-11-01T05:00:00Z' }, { body: 5, state: 'new' }],
  }, Date.parse('2026-11-01T09:00:00Z'), 3 * 3600e3);
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.ok(!/<script/.test(html));
  assert.match(text, /Заходили в CABINA 4 дня только число, без дат/);
  assert.match(text, /Как пришли По приглашению коллеги/);
  assert.doesNotMatch(text, /11111111-2222/, 'номер аккаунта пригласившего на экране не показываем');
  assert.match(text, /Неиспользованные приглашения .* 1/);
  assert.match(text, /Зарегистрировались по вашим приглашениям без почты и имён 2/);
  assert.match(text, /Из них засчитано .* 1/);
  assert.match(text, /Напоминание &lt;script&gt;alert\(1\)&lt;\/script&gt; 1 ноября 2026, 08:00 · принята/);
  assert.match(myDataHtml({ invited_by: 'admin' }).replace(/<[^>]+>/g, ' '), /По приглашению разработчика/);
});

test('согласие и политика называют второе хранилище зашифрованных копий и говорят, что ключа у него нет', async () => {
  const { OFFSITE, HOSTING } = await import('../../js/legal.js');
  const plain = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&laquo;|&raquo;/g, '"');
  for (const html of [consentHtml(), policyHtml()]) {
    const t = plain(html);
    assert.ok(t.includes(HOSTING.replace(/[«»]/g, '')) || t.includes(HOSTING), 'основной хостинг назван');
    assert.ok(t.includes(OFFSITE), 'второе хранилище названо');
    assert.match(t, /ключа шифрования у (этого провайдера|хранилища) нет/);
    assert.match(t, /14 дней/);
  }
});
