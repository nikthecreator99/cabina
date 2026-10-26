// Временная база PostgreSQL для автотестов сервера («стенд»): поднимается в папке /tmp,
// получает упрощённую копию Supabase (supabase-stub.sql) и все миграции из server/migrations,
// после тестов удаляется. Нужны программы PostgreSQL 15+ (initdb, pg_ctl, psql):
// путь можно указать в PG_BIN, иначе ищем в /usr/lib/postgresql/*/bin и в PATH.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, existsSync, chownSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const here = new URL('.', import.meta.url).pathname;
const migrations = new URL('../migrations/', import.meta.url).pathname;

function pgBin() {
  if (process.env.PG_BIN) return process.env.PG_BIN;
  const base = '/usr/lib/postgresql';
  if (existsSync(base)) {
    const v = readdirSync(base).sort((a, b) => b - a)[0];
    if (v) return join(base, v, 'bin');
  }
  return '';
}

// initdb не запускается от root: в контейнере запускаем программы от пользователя postgres.
const asRoot = process.getuid?.() === 0;
function run(cmd, args, opts = {}) {
  const bin = pgBin() ? join(pgBin(), cmd) : cmd;
  const [file, argv] = asRoot ? ['runuser', ['-u', 'postgres', '--', bin, ...args]] : [bin, args];
  return spawnSync(file, argv, { encoding: 'utf8', ...opts });
}

export async function startDb() {
  const dir = mkdtempSync(join(tmpdir(), 'cabina-db-'));
  if (asRoot) {
    const uid = Number(execFileSync('id', ['-u', 'postgres']).toString());
    const gid = Number(execFileSync('id', ['-g', 'postgres']).toString());
    chownSync(dir, uid, gid);
  }
  const data = join(dir, 'data');
  const port = String(20000 + Math.floor(Math.random() * 20000));
  let r = run('initdb', ['-D', data, '-U', 'postgres', '--auth=trust', '-E', 'UTF8', '--locale=C']);
  if (r.status !== 0) throw new Error(`initdb: ${r.stderr || r.error}`);
  r = run('pg_ctl', ['-D', data, '-w', '-l', join(dir, 'log'), '-o', `-k ${dir} -p ${port} -c listen_addresses=''`, 'start']);
  if (r.status !== 0) throw new Error(`pg_ctl start: ${r.stderr || r.stdout}`);

  const psql = (args, input) => run('psql', ['-h', dir, '-p', port, '-U', 'postgres', '-d', 'postgres',
    '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', ...args], { input });

  const apply = (file) => {
    const res = psql(['-f', file]);
    if (res.status !== 0) throw new Error(`${file}: ${res.stderr}`);
  };
  apply(join(here, 'supabase-stub.sql'));
  for (const f of readdirSync(migrations).filter((f) => f.endsWith('.sql')).sort()) apply(join(migrations, f));

  // who: undefined — суперпользователь (как владелец сервера в консоли);
  // 'anon' — приложение без входа; 'auth' — встроенный вход Supabase; uuid — вошедший человек.
  function sql(text, who) {
    let pre = '';
    if (who === 'anon') pre = `set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);`;
    else if (who === 'auth') pre = 'set local role supabase_auth_admin;';
    else if (who) pre = `set local role authenticated; select set_config('request.jwt.claims', '{"sub":"${who}","role":"authenticated"}', true);`;
    const res = psql([], `begin;\n\\o /dev/null\n${pre}\n\\o\n${text};\ncommit;\n`);
    const out = res.stdout.split('\n').filter((l) => l !== '');
    return { ok: res.status === 0, rows: out, err: res.stderr.trim() };
  }

  async function stop() {
    run('pg_ctl', ['-D', data, '-m', 'immediate', 'stop']);
    rmSync(dir, { recursive: true, force: true });
  }

  return { sql, stop };
}
