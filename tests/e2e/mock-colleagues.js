// Подменный сервер «Коллег» для браузерных проверок 2.15–2.16: ведёт себя как наш Supabase с миграциями 0002 и 0003
// (кому из коллег что видно: access; станции статуса — отдельно, status_places). Коллеги в нём свои статусы мне показывают.
// Все люди, станции и ключи — выдуманные.
import { NOW, seed } from './helpers.js';

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const EXP = Math.floor(Date.parse(NOW) / 1000) + 30 * 86400;
export const ME = '6f1c2a9e-0b7d-4c55-9a43-1e2f3a4b5c6d';
export const ANNA = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
export const OLEG = '11111111-2222-4333-8444-555555555555';
export const ACCESS = `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u({ sub: ME, email: 'ivan@example.com', role: 'authenticated', exp: EXP })}.c2ln`;

// Подменный сервер: хранит состояние как настоящий и записывает всё, что ему прислали
export async function mockServer(context, init = {}) {
  const db = {
    consents: [{ document: 'privacy-1', withdrawn_at: null }],
    cards: { [ANNA]: { user_id: ANNA, name: 'Анна Тестовая', role: 'other', depot: 'Сосновка', avatar: null, searchable: true }, [OLEG]: { user_id: OLEG, name: 'Олег Пробный', role: 'driver', depot: null, avatar: null, searchable: true } },
    links: [], statuses: {}, access: [], ...init,
  };
  const log = [];
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'apikey, authorization, content-type', 'access-control-allow-methods': 'GET, POST, PUT, OPTIONS' };
  const main = () => db.consents.some((c) => c.document === 'privacy-2' && !c.withdrawn_at);
  const mine = (l) => l.state !== 'declined' && (l.from_id === ME || l.to_id === ME);
  const other = (l) => (l.from_id === ME ? l.to_id : l.from_id);
  await context.route('https://api.cabina-app.ru/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const url = new URL(req.url());
    const path = url.pathname;
    let body = null;
    try { body = req.postDataJSON(); } catch {}
    const h = req.headers();
    log.push({ path, search: url.search, method: req.method(), body, auth: h.authorization || null });
    const send = (status, b) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: b === undefined ? '' : JSON.stringify(b) });
    if (h.authorization !== `Bearer ${ACCESS}`) return send(401, { code: '42501', message: 'permission denied' });
    const fail = (m) => send(400, { code: 'P0001', message: `cabina: ${m}` });
    const rpc = path.replace('/rest/v1/rpc/', '');
    switch (path) {
      case '/rest/v1/profiles': return send(200, [{ role: 'user' }]);
      case '/rest/v1/consents': return send(200, db.consents);
      case '/rest/v1/links': return send(200, db.links.filter(mine).map(({ from_id, to_id, state }) => ({ from_id, to_id, state })));
      case '/rest/v1/cards': {
        const seen = new Set([ME, ...db.links.filter((l) => mine(l)).map(other)]);
        return send(200, Object.values(db.cards).filter((c) => seen.has(c.user_id)));
      }
      case '/rest/v1/statuses': {
        const seen = new Set([ME, ...db.links.filter((l) => mine(l) && l.state === 'accepted').map(other)]);
        return send(200, Object.entries(db.statuses).filter(([k]) => seen.has(k)).map(([user_id, { place, dest, ...s }]) => ({ user_id, ...s, place: null, dest: null })));
      }
      case '/rest/v1/status_places': {
        const seen = new Set([ME, ...db.links.filter((l) => mine(l) && l.state === 'accepted').map(other)]);
        return send(200, Object.entries(db.statuses).filter(([k, s]) => seen.has(k) && (s.place || s.dest)).map(([user_id, s]) => ({ user_id, place: s.place || null, dest: s.dest || null })));
      }
      case '/rest/v1/access': return send(200, db.access.filter((a) => a.user_id === ME));
      default: break;
    }
    if (rpc === 'touch') return send(204);
    if (rpc === 'clear_status') { delete db.statuses[ME]; return send(204); }
    if (rpc === 'drop_colleague') { db.links = db.links.filter((l) => !(mine(l) && other(l) === body.p_other)); db.access = db.access.filter((a) => a.viewer_id !== body.p_other); return send(204); }
    if (rpc === 'set_access') {
      const grant = body.p_all || body.p_ids?.length;
      if (grant && !main()) return fail('consent required');
      db.access = db.access.filter((a) => !(a.user_id === ME && a.item === body.p_item));
      const colleague = (id) => db.links.some((l) => mine(l) && l.state === 'accepted' && other(l) === id);
      if (body.p_all) db.access.push({ user_id: ME, item: body.p_item, viewer_id: null });
      else for (const id of body.p_ids || []) if (colleague(id)) db.access.push({ user_id: ME, item: body.p_item, viewer_id: id });
      const has = (item) => db.access.some((a) => a.user_id === ME && a.item === item);
      if (!has('status')) delete db.statuses[ME];
      if (!has('place') && db.statuses[ME]) { db.statuses[ME].place = null; db.statuses[ME].dest = null; }
      return send(204);
    }
    if (rpc === 'leave_colleagues') { db.links = db.links.filter((l) => !mine(l)); db.access = db.access.filter((a) => a.user_id !== ME); delete db.cards[ME]; delete db.statuses[ME]; db.consents.forEach((c) => { if (c.document === 'publish-2') c.withdrawn_at = NOW; }); return send(204); }
    if (rpc === 'give_consent') {
      if (body.p_document === 'publish-2' && !main()) return fail('consent required');
      if (!['privacy-2', 'publish-2'].includes(body.p_document)) return fail('consent required');
      db.consents.push({ document: body.p_document, withdrawn_at: null });
      return send(204);
    }
    if (!main()) return fail('consent required');
    if (rpc === 'save_card') {
      if (body.p_searchable && !db.consents.some((c) => c.document === 'publish-2' && !c.withdrawn_at)) return fail('publish consent required');
      if (!body.p_searchable) db.consents.forEach((c) => { if (c.document === 'publish-2') c.withdrawn_at = NOW; });
      db.cards[ME] = { user_id: ME, name: body.p_name, role: body.p_role, depot: body.p_depot, avatar: body.p_avatar, searchable: body.p_searchable };
      return send(204);
    }
    if (rpc === 'find_colleagues') {
      const q = String(body.p_name).toLowerCase();
      if (q.replace(/[^a-zа-яё0-9]/g, '').length < 3) return fail('name too short');
      return send(200, Object.values(db.cards).filter((c) => c.searchable && c.user_id !== ME && c.name.toLowerCase().includes(q) && (!body.p_role || c.role === body.p_role))
        .map((c) => ({ id: c.user_id, name: c.name, role: c.role, depot: c.depot, avatar: c.avatar })));
    }
    if (rpc === 'offer_colleague') {
      if (!db.cards[ME]) return fail('name required');
      db.links.push({ from_id: ME, to_id: body.p_to, state: 'pending' });
      return send(200, 'sent');
    }
    if (rpc === 'answer_colleague') {
      const l = db.links.find((x) => x.from_id === body.p_from && x.to_id === ME && x.state === 'pending');
      if (!l) return fail('not found');
      l.state = body.p_accept ? 'accepted' : 'declined';
      return send(204);
    }
    if (rpc === 'set_status') {
      const has = (item) => db.access.some((a) => a.user_id === ME && a.item === item);
      if (!db.links.some((l) => mine(l) && l.state === 'accepted') || !has('status')) { delete db.statuses[ME]; return send(204); }
      const pl = has('place');
      db.statuses[ME] = { kind: body.p_kind, place: pl ? body.p_place : null, dest: pl ? body.p_dest : null, part: body.p_part, note: body.p_note, until_at: body.p_until, updated_at: NOW };
      return send(204);
    }
    return send(404, { code: 'PGRST202', message: 'not found' });
  });
  return { db, log, calls: (name) => log.filter((r) => r.path === `/rest/v1/rpc/${name}`) };
}

export async function signIn(page) {
  await page.evaluate(({ access, exp, sub }) => localStorage.setItem('cabina-account', JSON.stringify({ access, refresh: 'refresh-secret-1', exp, email: 'ivan@example.com', sub })),
    { access: ACCESS, exp: EXP * 1000, sub: ME });
}
export const setProfile = (page, p) => page.evaluate(async (x) => { const s = await import('./js/store.js'); await s.saveProfile(x); }, p);
// Иван отдыхает в Ольховке до 14:00 (поездка 02:00–10:00, отдых — половина рабочего времени, но не меньше 4 ч)
export const TRIP = { id: 'tr1', start: '2026-10-20T02:00', end: '2026-10-20T10:00', routeLabel: 'Сосновка → Ольховка', locoType: '2ЭС5К', locoNumber: '355', routeNo: '2402' };

export async function ready(context, page, init, tweak) {
  const srv = await mockServer(context, init);
  tweak?.(srv.db);
  await signIn(page);
  await seed(page, { trips: [TRIP] });
  await setProfile(page, { name: 'Иван Тестовый', depot: 'Сосновка-депо', phone: '+7 900 111-22-33' });
  await page.reload(); await page.waitForSelector('.screen');
  return srv;
}


// Профиль → ⚙ Настройки → «Настройки аккаунта» → «Приватность»
export async function openPrivacy(page) {
  await page.locator('.tab[data-tab=profile]').click();
  await page.locator('.screen [data-page=settings]').click();
  await page.locator('.screen [data-page=account]').click();
  await page.locator('.screen [data-page=privacy]').click();
  await page.locator('#pv-access').waitFor();
  await page.waitForFunction(() => !/Видят: …/.test(document.querySelector('#pv-access')?.innerText || ''));
}
// Выбрать «кому видно» для статуса или «где я»: none | all | some (names — кого отметить)
export async function chooseAccess(page, item, mode, names = []) {
  await page.locator(`[data-act=col-access][data-item=${item}]`).click();
  const sh = page.locator('#layers .layer:not(.closing)').last();
  await sh.locator(`.radio-row[data-mode=${mode}]`).click();
  for (const n of names) await sh.locator('.pick-row', { hasText: n }).click();
  await sh.locator('[data-act=access-save]').click();
}
