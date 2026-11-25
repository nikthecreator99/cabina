import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openApp, waitNoLayers } from './helpers.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

test('Safari: подсказка по панели и начало работы без регистрации', async () => {
  const { context, page } = await openApp(env, { onboard:false, guest:true,
    userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1' });
  await page.getByRole('button',{name:'Установить на телефон'}).click();
  assert.equal(await page.locator('.point-more').count(),1);
  await page.getByRole('button',{name:'На панели есть «Поделиться»'}).click();
  assert.equal(await page.locator('.point-share').count(),1);
  await page.getByRole('button',{name:'Продолжить',exact:true}).click();
  await page.getByRole('button',{name:'Начать без регистрации'}).click();
  await waitNoLayers(page);
  await page.reload();
  await page.waitForSelector('.home-screen');
  assert.equal(await page.locator('[data-first]').count(),0);
  await context.close();
});

test('Android: системная установка открывает следующий шаг с регистрацией', async () => {
  const { context, page } = await openApp(env,{onboard:false,guest:true,userAgent:'Android Chrome/143.0 Mobile Safari/537.36'});
  await page.evaluate(() => {
    const event=new Event('beforeinstallprompt',{cancelable:true});
    event.prompt=async()=>{document.body.dataset.installRequested='yes';};
    event.userChoice=Promise.resolve({outcome:'accepted'});
    window.dispatchEvent(event);
  });
  await page.getByRole('button',{name:'Установить на телефон'}).click();
  assert.equal(await page.locator('body').getAttribute('data-install-requested'),'yes');
  await page.getByRole('button',{name:'Создать аккаунт'}).click();
  await page.waitForSelector('[data-page="account"] input[type=email]');
  await context.close();
});

test('пометка демо помещается в широком окне и остаётся внутри сканера на узком', async () => {
  const {context,page}=await openApp(env);
  await page.getByRole('button',{name:'Добавить поездку',exact:true}).click();
  for(const width of [320,430]){
    await page.setViewportSize({width,height:820});
    const scan=page.locator('[data-act=tf-scan]');
    const fits=await scan.evaluate(el=>el.scrollWidth<=el.clientWidth+1);
    assert.ok(fits);
    assert.equal(await scan.locator('.scan-demo').isVisible(),width===430);
  }
  await page.setViewportSize({width:320,height:820});
  await page.locator('[data-act=tf-scan]').click();
  await page.getByRole('dialog',{name:'По фото маршрута · демо'}).waitFor();
  await context.close();
});
