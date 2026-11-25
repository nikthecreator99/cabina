import { avatarSvg, bgSvg } from './avatar.js';
import { API, session, accessToken } from './auth.js';

const status = document.querySelector('#status');
const products = [...document.querySelectorAll('[data-sku]')];
const account = session()?.sub;
let terms, mode, busy = false;

async function call(path, body) {
  const headers = {};
  if (path !== 'catalog') headers.Authorization = 'Bearer ' + await accessToken();
  if (body) headers['Content-Type'] = 'application/json';
  const response = await fetch(API + '/shop/v1/' + path, {
    method: body ? 'POST' : 'GET', headers, body: body && JSON.stringify(body), cache: 'no-store'
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.message || 'Сервис временно недоступен.');
  return data;
}

function preview(sku) {
  if (['depot', 'ocean'].includes(sku)) return bgSvg(sku);
  if (sku === 'peaked') return avatarSvg({hat: 'peaked'});
  if (sku === 'mazut') return avatarSvg({mazut: true});
  return avatarSvg({sex: sku});
}

async function buy(card) {
  if (busy || session()?.sub !== account) return;
  const sku = card.dataset.sku;
  const price = Number.parseInt(card.querySelector('strong').textContent, 10);
  const name = card.querySelector('h2').textContent;
  if (!confirm('Принимаю публичную оферту и оплачиваю «' + name + '» за ' + price + ' ₽.' +
    (mode === 'test' ? ' Тестовый режим.' : ''))) return;
  busy = true;
  try {
    const result = await call('checkout', {sku, terms, price});
    if (result.owned) { location.reload(); return; }
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = 'https://auth.robokassa.ru/Merchant/Index.aspx';
    for (const [name, value] of Object.entries(result.fields)) {
      const input = document.createElement('input');
      Object.assign(input, {type:'hidden', name, value});
      form.append(input);
    }
    document.body.append(form);
    form.submit();
  } catch (err) {
    status.textContent = err.message;
    busy = false;
  }
}

for (const card of products) card.querySelector('.preview').innerHTML = preview(card.dataset.sku);
try {
  ({terms, mode} = await call('catalog'));
  const owned = account ? (await call('owned')).owned : [];
  if (account && session()?.sub === account) localStorage.setItem('cabina-owned-' + account, JSON.stringify(owned));
  for (const card of products) {
    const action = card.querySelector('.action');
    if (owned.includes(card.dataset.sku)) action.textContent = 'Уже в профиле';
    else if (account && mode !== 'off') {
      const button = document.createElement('button');
      button.className = 'btn btn-primary';
      button.textContent = 'Купить';
      button.onclick = () => buy(card);
      action.append(button);
    }
  }
  status.textContent = mode === 'off' ? 'Приём оплаты пока закрыт.' :
    mode === 'test' ? 'Тестовый режим оплаты.' : account ? '' : 'Для покупки войдите в свой аккаунт в CABINA.';
  if (new URLSearchParams(location.search).has('InvId')) {
    status.textContent = 'После подтверждения платежа у предмета появится отметка «Уже в профиле».';
    const refresh = document.createElement('button');
    refresh.className = 'btn btn-ghost';
    refresh.textContent = 'Проверить покупку';
    refresh.onclick = () => location.reload();
    status.append(refresh);
  }
} catch {
  status.textContent = 'Сейчас доступен просмотр каталога. Для покупки проверьте соединение и обновите страницу.';
}
