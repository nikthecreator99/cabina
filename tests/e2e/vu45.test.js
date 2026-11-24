import test from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openApp } from './helpers.js';

test('ВУ-45 из меню, черновик, переключение режима и бланк для печати', async () => {
  const env = await startEnv();
  try {
    const {page} = await openApp(env);
    const open = async () => {
      await page.locator('[data-tab=extra]').click();
      await page.locator('[data-act=extra-vu45]').click();
    };
    await open();
    const advisory = page.locator('.vu-advisory');
    assert.equal(await advisory.isVisible(),true);
    assert.match(await advisory.innerText(),/Справочная информация/);
    const disclaimer = await advisory.locator('p').innerText();
    assert.match(disclaimer,/Разработчик не несёт ответственности/);
    for (const side of await page.locator('#vu-paper > section').all()) {
      assert.ok((await side.innerText()).includes(disclaimer));
    }
    await page.getByText('Поезд',{exact:true}).click();
    await page.getByLabel('Руководящий спуск, ‰').fill('6');
    await page.locator('[data-field=blockSystem]').selectOption('three');
    await page.getByText('Вес и тормозное нажатие',{exact:true}).click();
    await page.locator('[data-mode=total]').click();
    for (const [k,v] of Object.entries({weight:'1000',axes:'60',force:'330'})) {
      await page.locator('[data-field='+k+']').fill(v);
    }
    assert.match(await page.locator('#vu-result').innerText(),/80 км\/ч/);
    await page.reload();
    await open();
    assert.match(await page.locator('#vu-result').innerText(),/80 км\/ч/);
    await page.getByText('Вес и тормозное нажатие',{exact:true}).click();
    await page.locator('[data-mode=groups]').click();
    await page.getByLabel('Осей',{exact:true}).fill('40');
    assert.match(await page.locator('#vu-result').innerText(),/340 тс/);
    await page.locator('[data-section=measure] summary').click();
    await page.locator('[data-field=freight]').check();
    await page.locator('[data-field=volume]').fill('2000');
    await page.locator('[data-field=second]').fill('105');
    const measures=page.locator('#vu-measures');
    assert.match(await measures.innerText(),/104 с · выдержан/);
    await page.locator('[data-field=joinedReservoirs]').check();
    assert.doesNotMatch(await measures.innerText(),/выдержан/);
    await page.locator('[data-field=joinedMinimum]').fill('120');
    assert.match(await measures.innerText(),/120 с · ниже нормы/);
    await page.emulateMedia({media:'print'});
    assert.equal(await page.locator('#vu-paper').isVisible(),true);
    assert.equal(await page.locator('.vu-actions').isVisible(),false);
    const pdf=await page.pdf({format:'A4'});
    assert.equal(pdf.subarray(0,4).toString(),'%PDF');
  } finally { await env.stop(); }
});

test('Особый случай, отметки и оборотная сторона сохраняются в черновике, PDF содержит две страницы', async () => {
  const env = await startEnv();
  try {
    const {page,errors} = await openApp(env);
    const open = async () => {
      await page.locator('[data-tab=extra]').click();
      await page.locator('[data-act=extra-vu45]').click();
    };
    await open();
    await page.getByText('Вес и тормозное нажатие',{exact:true}).click();
    await page.locator('[data-mode=special]').click();
    for (const [k,v] of Object.entries({weight:'1000',axes:'60',acceptedRate:'33',specialSource:'Тест'}))
      await page.locator('[data-field='+k+']').fill(v);
    assert.doesNotMatch(await page.locator('#vu-paper').innerText(),/Принято без подсчёта/);
    await page.locator('[data-field=specialChecked]').check();
    assert.match(await page.locator('#vu-paper').innerText(),/Принято без подсчёта: 33/);
    await page.locator('[data-field=weight]').fill('2000');
    assert.equal(await page.locator('[data-field=specialChecked]').isChecked(),false);
    await page.getByText('Опробование в пути следования',{exact:true}).click();
    await page.getByRole('button',{name:'Добавить отметку'}).click();
    await page.locator('[data-route=place]').fill('Няндома');
    await page.locator('[data-route=kind]').fill('Сокращённое');
    await page.locator('details[data-section=checks] summary').click();
    await page.locator('[data-check="0"]').check();
    await page.reload();
    await open();
    assert.match(await page.locator('.vu-reverse').innerText(),/Няндома/);
    assert.match(await page.locator('#vu-count').innerText(),/1/);
    const downloadPromise = page.waitForEvent('download',{timeout:6000});
    await page.getByRole('button',{name:'Справка в PDF'}).click();
    const download = await downloadPromise;
    const chunks = [];
    for await (const chunk of await download.createReadStream()) chunks.push(chunk);
    const pdf = Buffer.concat(chunks).toString('latin1');
    assert.match(pdf,/\/Count 2\b/);
    assert.equal((pdf.match(/\/Type \/Page\b/g) || []).length,2);
    assert.deepEqual(errors,[]);
  } finally { await env.stop(); }
});

test('Ручные данные локомотива меняют итог справки и сохраняются после перезапуска', async () => {
  const env = await startEnv();
  try {
    const {page} = await openApp(env);
    const open = async () => {
      await page.locator('[data-tab=extra]').click();
      await page.locator('[data-act=extra-vu45]').click();
    };
    await open();
    await page.locator('[data-section=brakes] summary').click();
    await page.locator('[data-mode=total]').click();
    const fill = async (values) => {
      for (const [key,value] of Object.entries(values)) await page.locator('[data-field='+key+']').fill(String(value));
    };
    await page.locator('[data-section=train] summary').click();
    await page.locator('[data-field=category]').selectOption('12');
    await fill({axes:100,weight:1000,force:330});
    await page.locator('[data-section=special] summary').click();
    await page.locator('[data-field=includeLoco]').check();
    await page.locator('[data-field=locoMethod]').selectOption('rate');
    await fill({locoWeight:120,locoAxes:6,locoBrakeAxes:6,locoRate:12,locoHandAxes:2});
    await page.reload();
    await open();
    assert.match(await page.locator('#vu-result').innerText(),/402 тс/);
    assert.match(await page.locator('#vu-paper').innerText(),/всего осей 106/);
    assert.match(await page.locator('#vu-paper').innerText(),/суммарное нажатие 72 тс/);
  } finally { await env.stop(); }
});

test('Грузопассажирский поезд, 38 тс/100 тс: офлайн, смена уклона и выгрузка на узком экране', async () => {
  const env=await startEnv();
  try {
    const {context,page}=await openApp(env,{sw:true});
    await page.evaluate(async()=>{await navigator.serviceWorker.ready});
    await context.setOffline(true);
    await page.reload();
    await page.setViewportSize({width:360,height:740});
    await page.locator('[data-tab=extra]').click();
    await page.locator('[data-act=extra-vu45]').click();
    await page.locator('[data-section=train] summary').click();
    const field = key => page.locator('[data-field='+key+']');
    await field('category').selectOption('12');
    await field('blockSystem').selectOption('three');
    await field('exception').check();
    await field('grade').fill('10,001');
    await page.locator('[data-section=brakes] summary').click();
    await page.locator('[data-mode=total]').click();
    for (const [k,v] of Object.entries({weight:'1000',force:'380',axes:'64'})) await field(k).fill(v);
    const result=page.locator('#vu-result');
    assert.match(await result.innerText(),/65 км\/ч/);
    await field('grade').fill('10');
    assert.match(await result.innerText(),/75 км\/ч/);
    await field('blockSystem').selectOption('semi');
    assert.doesNotMatch(await result.innerText(),/\d+ км\/ч/);
    const paper=await page.locator('#vu-paper').innerText();
    assert.match(paper,/Требуемое нажатие 440 тс/);
    assert.match(paper,/осей 64/);
    const [download]=await Promise.all([page.waitForEvent('download'),page.locator('[data-vu=pdf]').click()]);
    assert.equal(await download.failure(),null);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  } finally {await env.stop()}
});

test('ВУ-45: кнопки и поля помещаются при крупном тексте в обеих темах', async () => {
  const env=await startEnv();
  try {
    const {page}=await openApp(env);
    await page.locator('[data-tab=extra]').click();
    await page.locator('[data-act=extra-vu45]').click();
    await page.locator('#vu45 details').evaluateAll(items=>items.forEach(item=>item.open=true));
    for (const width of [320,360,390,768]) {
      await page.setViewportSize({width,height:800});
      for (const theme of ['light','dark']) {
        const problems=await page.evaluate(theme=>{
          document.documentElement.dataset.theme=theme;
          document.documentElement.style.setProperty('--fs','1.3');
          const root=document.querySelector('#vu45');
          const controls=[...root.querySelectorAll('button,input,select,summary')].map(el=>el.getBoundingClientRect()).filter(r=>r.width && r.height);
          const outside=controls.some(r=>r.left<0 || r.right>innerWidth+1);
          const overlap=controls.some((a,i)=>controls.slice(i+1).some(b=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1));
          return outside || overlap || document.documentElement.scrollWidth>innerWidth;
        },theme);
        assert.equal(problems,false,theme+' '+width);
      }
    }
  } finally {await env.stop()}
});
