// Проверка работы Codex (26.11.2026): выход стирает список покупок аккаунта.
import test from 'node:test';
import assert from 'node:assert/strict';

test('выход из аккаунта стирает покупки, запомненные в телефоне, и не трогает остальное', async () => {
  const data = new Map([
    ['cabina-account', '{}'], ['cabina-owned-u1', '["robot"]'], ['cabina-owned-u2', '["ocean"]'],
    ['cabina-ai-history', '[]'], ['cabina-col-notes', '[]'], ['cabina-text', 'l'],
  ]);
  const ls = {
    getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k),
  };
  globalThis.localStorage = new Proxy(ls, { ownKeys: () => [...data.keys()], getOwnPropertyDescriptor: (_, k) => data.has(k) ? { enumerable: true, configurable: true, value: data.get(k) } : undefined });
  try {
    const { forget } = await import('../../js/auth.js');
    forget();
    assert.deepEqual([...data.keys()], ['cabina-text']);
  } finally { delete globalThis.localStorage; }
});
