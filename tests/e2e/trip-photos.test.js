import test from 'node:test';
import assert from 'node:assert/strict';
import {startEnv, openApp} from './helpers.js';

test('Личные фото новой и сохранённой поездки, просмотр, отмена, передача и удаление', async () => {
  const env = await startEnv();
  try {
    const {page,context,errors} = await openApp(env,{sw:true});
    await page.evaluate(async()=>{await navigator.serviceWorker.ready});
    await context.setOffline(true);
    await page.reload();
    await page.setViewportSize({width:320,height:700});
    const add = page.locator('[data-act=add-trip]');
    const input = page.locator('[data-photo-files]');
    const thumb = page.locator('.trip-photo-strip button');
    const save = page.locator('[data-act=save-trip]');
    const close = () => page.locator('.layer').last().locator('.sheet-head [data-close]').click();
    const file = {name:'local-photo.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')};
    const code = () => page.evaluate(async()=>{
      const {encodeTrips} = await import('./js/share.js');
      const {S} = await import('./js/store.js');
      return encodeTrips(S.trips,1700000000000);
    });
    await add.click();
    await page.locator('#tf-sd').fill('2026-10-14');
    await page.locator('#tf-st').fill('08:00');
    await page.locator('#tf-et').fill('16:00');
    await page.locator('[data-rest=turnaround]').click();
    await input.setInputFiles(file);
    await thumb.first().waitFor();
    await save.click();
    await page.locator('.trip').first().waitFor();
    const before = await code();
    await page.reload();
    await page.locator('.trip').first().click();
    await thumb.first().click();
    await page.locator('.trip-photo-full').waitFor();
    await close();
    await input.setInputFiles({...file,name:'second.png'});
    await thumb.nth(1).waitFor();
    for (const theme of ['light','dark']) {
      const fits = await page.evaluate(theme => {
        document.documentElement.dataset.theme=theme;
        document.documentElement.style.setProperty('--fs','1.3');
        const add=document.querySelector('[data-photo-add]').getBoundingClientRect();
        const route=document.querySelector('#tf-add-routeno').getBoundingClientRect();
        const tiles=[...document.querySelectorAll('.trip-photo-strip button')].map(b=>b.getBoundingClientRect());
        return route.bottom<=add.top && add.bottom<=tiles[0].top && tiles[0].right<=tiles[1].left &&
          tiles.every(t=>t.width>=44 && t.height>=44 && t.right<=innerWidth);
      },theme);
      assert.ok(fits,theme);
    }
    await save.click();
    await page.waitForSelector('.layer',{state:'detached'});
    assert.equal(await code(),before);
    assert.equal(await page.evaluate(async()=> (await (await import('./js/db.js')).documentBlobs()).length),0);
    await page.locator('.trip').first().click();
    await thumb.nth(1).click();
    await page.locator('[data-prev]').click();
    await page.locator('[data-remove]').last().click();
    await close(); // отмена сохраняет оба фото
    await page.locator('.trip').first().click();
    await thumb.nth(1).waitFor();
    await page.locator('[data-act=del-trip]').click();
    await page.locator('[data-act=yes]').click();
    await page.waitForSelector('.layer',{state:'detached'});
    assert.equal(await page.evaluate(async()=> (await (await import('./js/db.js')).getAll('blobs')).length),0);
    assert.deepEqual(errors.filter(s=>!s.includes('ERR_INTERNET_DISCONNECTED')),[]);
  } finally {await env.stop()}
});
