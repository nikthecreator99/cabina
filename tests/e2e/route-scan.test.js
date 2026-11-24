import test from 'node:test';
import assert from 'node:assert/strict';
import {startEnv,openApp} from './helpers.js';

test('Распознавание на устройстве, сверка и перенос только выбранных полей',async()=>{
  const env=await startEnv();
  try{
    const {page,context}=await openApp(env);
    const requests=[];env.server.on('request',req=>requests.push(req.method));
    const external=[];context.on('request',r=>{if(/^https?:/.test(r.url())&&new URL(r.url()).origin!==new URL(env.url).origin)external.push(r.url())});
    await page.setViewportSize({width:320,height:700});
    await page.locator('[data-act=add-trip]').click();
    const btn=page.locator('[data-act=tf-scan]'),receive=page.locator('[data-act=tf-receive]');
    for(const theme of ['light','dark']){
      await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;document.documentElement.style.setProperty('--fs','1.3')},theme);
      await page.waitForTimeout(280);
      const a=await btn.boundingBox(),b=await receive.boundingBox();
      assert.ok(a.x>=b.x+b.width-1 && a.x+a.width<=321 && Math.abs(a.y-b.y)<1 && a.height>=44);
    }
    await btn.click();
    const dialog=page.locator('.layer').last();
    const img=await page.evaluate(()=>{
      const c=document.createElement('canvas');c.width=850;c.height=320;const ctx=c.getContext('2d');
      ctx.fillStyle='#fff';ctx.fillRect(0,0,850,320);ctx.fillStyle='#111';ctx.font='40px sans-serif';
      ['Дата: 10.11.2026','Явка: 08:29','Окончание работы: 20:19','Количество осей: 216'].forEach((s,i)=>ctx.fillText(s,30,55+i*70));
      return c.toDataURL('image/png').split(',')[1]
    });
    await dialog.locator('input[type=file]').setInputFiles({name:'route.png',mimeType:'image/png',buffer:Buffer.from(img,'base64')});
    await dialog.locator('[data-read]').click();
    const row=dialog.locator('[data-review] > [data-key=st]');
    await row.waitFor({timeout:120000});
    assert.equal(await row.locator('.input').inputValue(),'08:29');
    assert.equal(await page.locator('#tf-st').inputValue(),'');
    assert.ok(await dialog.locator('[data-apply]').isDisabled());
    await row.locator('.input').fill('08:30');
    await dialog.locator('[data-apply]').click();
    assert.equal(await page.locator('#tf-st').inputValue(),'08:30');
    assert.equal(await page.locator('#tf-et').inputValue(),'');
    assert.equal(await page.evaluate(async()=>(await(await import('./js/db.js')).getAll('blobs')).length),0);
    assert.deepEqual(external,[]);assert.ok(requests.every(m=>m==='GET'));
  } finally{await env.stop()}
});
