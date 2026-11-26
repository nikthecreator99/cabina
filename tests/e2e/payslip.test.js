import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startEnv,openApp} from './helpers.js';
test('приватная проверка PDF, фото и сканированного PDF через меню «Ещё»',{timeout:180000},async()=>{
  const env=await startEnv();
  try {
    const {page,context}=await openApp(env);
    await page.locator('.tab[data-tab=extra]').click();
    await page.locator('button[data-page=payslip]').click();
    const doc=await context.newPage();
    await doc.setViewportSize({width:1050,height:430});
    await doc.setContent('<meta name="viewport" content="width=device-width"><style>body{font:32px Arial;color:black;background:white;margin:32px}p{margin:12px 0}</style><p>Расчетный листок за март месяц 2025 года</p><p>Оклад/Тариф 200,00</p><p>март Оплата 004L 10,00/ 2000,00</p><p>Всего начислено 2000,00</p>');
    const pdf=await doc.pdf({width:'1050px',height:'430px'});
    const png=await doc.screenshot({scale:'css'});
    await doc.setContent('<img style="width:1000px" src="data:image/png;base64,'+png.toString('base64')+'">');
    const scan=await doc.pdf({width:'1050px',height:'500px'});
    // Reproduce WebKit's stream API on the document-import path in Chromium.
    await page.evaluate(()=>Reflect.deleteProperty(ReadableStream.prototype, Symbol.asyncIterator));
    const outgoing=[];
    const origin=new URL(page.url()).origin;
    const assets=new Set(['pdf.js','pdf.worker.js','ocr.js','worker.js','tesseract-core-lstm.wasm.js','rus.traineddata.gz','eng.traineddata.gz'].map(f=>'/js/vendor/payslip/'+f));
    context.on('request',req=>{
      const url=new URL(req.url());
      if(url.protocol==='blob:' && url.origin===origin) return;
      if(req.method()!=='GET' || url.origin!==origin || !assets.has(url.pathname) || url.search || req.postData()) outgoing.push(req.url());
    });
    for(const [name,mimeType,buffer] of [['form.pdf','application/pdf',pdf],['form.png','image/png',png],['scan.pdf','application/pdf',scan]]) {
      await page.locator('#ps-files').setInputFiles({name,mimeType,buffer});
      try {await page.waitForSelector('#ps-details',{timeout:45000});}
      catch(error){throw Error(name+' — '+await page.locator('.screen [role=status]').innerText(),{cause:error});}
      if(name!=='form.pdf') {
        await page.locator('[data-act=ps-edit]').click();
        const input=page.locator('#ps-correction');
        const text=await input.inputValue();
        assert.match(text,/2000,00/);
        await input.fill(text.replace(/004[1I|]/g,'004L'));
        await page.locator('[data-act=ps-apply]').click();
      }
      // 2.43: сверху итог проверки, пустые группы не показываем, раскрыта только «Не сошлось»
      assert.equal(await page.locator('#ps-details [data-verdict]').count(),1);
      assert.equal(await page.locator('#ps-details > details[data-ps-group=diff]').count(),0);
      assert.ok(await page.locator('#ps-details > details').count()>=1);
      assert.equal(await page.locator('#ps-details > details[open]').count(),0);
      await page.locator('[data-ps-group=ok] > summary').click();
      const detail=await page.locator('[data-ps-group=ok]').innerText();
      assert.match(detail,/004L/);assert.match(detail,/2\s?000,00/);
      if(name!=='form.pdf') assert.match(await page.locator('.screen').innerText(),/распознаны с изображения/);
    }
    await page.locator('[data-act=ps-clear]').click();
    assert.equal(await page.locator('#ps-details, #ps-correction, [data-act=ps-edit]').count(),0);
    await page.locator('#ps-files').setInputFiles({name:'again.pdf',mimeType:'application/pdf',buffer:pdf});
    await page.waitForSelector('#ps-details');
    assert.deepEqual(outgoing,[]);
    await page.locator('.screen [data-act=back]').click();await page.locator('button[data-page=payslip]').click();
    assert.equal(await page.locator('#ps-details').count(),0);
  } finally {await env.stop();}
});
