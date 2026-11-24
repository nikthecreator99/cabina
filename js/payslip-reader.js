// Only same-origin reader assets are fetched. PDF and camera data stay in memory.
const asset=name=>new URL('./vendor/payslip/'+name,import.meta.url).href;
function lines(words) {
  const rows=[];
  for(const w of words.filter(w=>w.text.trim()).sort((a,b)=>a.y-b.y || a.x-b.x)) {
    let row=rows.at(-1);
    if(!row || w.y-row.y>Math.max(1,Math.min(row.height,w.h)*0.55)) {
      row={y:w.y,height:w.h,words:[]}; rows.push(row);
    }
    row.words.push(w);
  }
  return rows.map(r=>r.words.sort((a,b)=>a.x-b.x).map(w=>w.text.trim()).join(' ')).join('\n');
}
export function pdfPageText(content,vp) {
  return lines(content.items.filter(x=>x.str).map(x=>{
    const [left,top]=vp.convertToViewportPoint(x.transform[4],x.transform[5]);
    return {text:x.str,x:left,y:top,h:Math.abs(x.height)||8};
  }));
}
// Safari supports getReader() on this stream even on versions where for-await is unavailable.
async function readPageText(page, viewport) {
  const reader = page.streamTextContent().getReader();
  const items = [];
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      for (const item of value.items) items.push(item);
    }
  } finally {
    reader.releaseLock();
  }
  return pdfPageText({items}, viewport);
}

export async function imageCanvas(file) {
  const url=URL.createObjectURL(file);
  try {
    const image=new Image(); image.src=url; await image.decode();
    const scale=Math.min(1,3200/Math.max(image.width,image.height));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
    return canvas;
  } finally { URL.revokeObjectURL(url); }
}
export async function readPayslip(files,progress,signal) {
  if(!files.length || files.length>12 || files.some(f=>f.size>30*1024*1024)) throw Error('Выберите до 12 страниц одного листка, до 30 МБ на файл.');
  const isPdf=f=>f.type==='application/pdf' || /\.pdf$/i.test(f.name);
  if(files.some(isPdf) && files.length!==1) throw Error('Выберите один PDF или фотографии страниц одного месяца.');
  let worker=null,task=null,usedOCR=false;
  const pages=[];
  function active(){if(signal.aborted) throw new DOMException('Отменено','AbortError');}
  function stop(){
    if(worker){worker.terminate();worker=null;}
    if(task){task.destroy().catch(()=>{});task=null;}
  }
  signal.addEventListener('abort',stop,{once:true});
  async function recognize(canvas,label) {
    progress('Распознаём '+label+' на устройстве…'); usedOCR=true;
    try {
      if(!worker) {
        const {default:ocr}=await import('./vendor/payslip/ocr.js');active();
        worker=await ocr.createWorker('rus+eng',1,{workerPath:asset('worker.js'),corePath:asset('tesseract-core-lstm.wasm.js'),langPath:asset(''),workerBlobURL:false,cacheMethod:'none',errorHandler:()=>{}});
        active();await worker.setParameters({tessedit_pageseg_mode:'6',preserve_interword_spaces:'1'});
      }
      active();const {data}=await worker.recognize(canvas,{}, {blocks:true,text:true});
      const words=[];
      for(const block of data.blocks||[]) for(const paragraph of block.paragraphs) for(const line of paragraph.lines) for(const word of line.words) {
        const b=word.bbox; words.push({text:word.text,x:b.x0,y:(b.y0+b.y1)/2,h:b.y1-b.y0});
      }
      return words.length?lines(words):data.text;
    } finally {canvas.width=canvas.height=1;}
  }
  try {
    if(isPdf(files[0])) {
      const pdf=await import('./vendor/payslip/pdf.js').catch(()=>{
        throw Error('Не удалось загрузить модуль чтения PDF. Проверьте подключение и откройте листок ещё раз.');
      });
      active();
      pdf.GlobalWorkerOptions.workerSrc=asset('pdf.worker.js');
      task=pdf.getDocument({data:await files[0].arrayBuffer(),isEvalSupported:false,useSystemFonts:true,useWasm:false,enableXfa:false});
      const doc=await task.promise;active();
      if(doc.numPages>24) throw Error('Выберите PDF одного месяца, до 24 страниц.');
      for(let i=1;i<=doc.numPages;i++) {
        active();progress('Читаем страницу '+i+' из '+doc.numPages+'…');
        const page=await doc.getPage(i), vp=page.getViewport({scale:1});
        let text=await readPageText(page,vp);
        if(text.trim().length<12 && (await page.getOperatorList()).fnArray.some(op=>[pdf.OPS.paintImageXObject,pdf.OPS.paintInlineImageXObject,pdf.OPS.paintImageMaskXObject].includes(op))) {
          const view=page.getViewport({scale:Math.min(3,3000/Math.max(vp.width,vp.height))});
          const canvas=document.createElement('canvas');canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);
          await page.render({canvas,viewport:view}).promise;text=await recognize(canvas,'страницу '+i);
        }
        pages.push(text);page.cleanup();
      }
    } else {
      for(let i=0;i<files.length;i++){active();pages.push(await recognize(await imageCanvas(files[i]),'фото '+(i+1)+' из '+files.length));}
    }
    active();return {text:pages.join('\n'),usedOCR};
  } finally {signal.removeEventListener('abort',stop);stop();}
}
