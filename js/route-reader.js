// Photo bytes and recognition results never leave this browser.
import { imageCanvas } from './payslip-reader.js';
import { penMask, inkWords, wordMask, classify } from './route-ink.js';
import { loadDigits, readDigits } from './route-digits.js';
const asset = name => new URL('./vendor/payslip/'+name,import.meta.url).href;
export const fields = {
  sd:'Дата явки', st:'Явка', ed:'Дата окончания', et:'Окончание работы', routeNo:'Номер маршрута',
  routeLabel:'Участок', locoType:'Серия локомотива', locoNumber:'Номер локомотива',
  weight:'Вес брутто, т', axles:'Количество осей', length:'Условная длина',
  passSt:'Пассажиром · начало', passEt:'Пассажиром · окончание', passTrain:'Пассажиром · номер поезда'
};
for (let i=0;i<2;i++) for (const [k,label] of Object.entries({energyFrom:'Энергия · было',energyTo:'Энергия · стало',regenFrom:'Рекуперация · было',regenTo:'Рекуперация · стало'}))
  fields[i+'_'+k]=`Секция ${i+1} · ${label}`;

export function normalize(key, raw) {
  const s=raw.trim();
  if (key==='sd'||key==='ed') {
    const m=s.match(/^(\d{1,2})\D+(\d{1,2})\D+(\d{4}|\d{2})$/);
    const date=m ? (m[3].length===2?'20':'')+m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0') : s;
    const d=new Date(date+'T00:00:00Z');
    return /^20\d\d-\d\d-\d\d$/.test(date)&&!isNaN(d)&&d.toISOString().startsWith(date)?date:'';
  }
  if(['st','et','passSt','passEt'].includes(key)){
    const m=s.match(/^(\d{1,2})\s*[:.,]\s*(\d{2})$/);
    return m && +m[1]<24 && +m[2]<60 ? m[1].padStart(2,'0')+':'+m[2]:'';
  }
  if(key==='routeLabel') return s.length<100 && /[а-яё]/i.test(s)?s:'';
  if(key==='locoType') return /^[0-9А-ЯЁA-Z-]{2,16}$/i.test(s)&&/[а-яa-z]/i.test(s)?s.toUpperCase():'';
  const digits=s.replace(/\s/g,'');
  const limit=key==='weight'?6:key==='axles'||key==='length'?4:key==='routeNo'?20:12;
  return /^\d+$/.test(digits) && digits.length<=limit ? digits:'';
}

export function labelled(text) {
  const rows=[];
  const patterns={
    sd:/дата(?:\s+явки)?\s*[:№-]?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i,
    ed:/дата окончания\s*[: -]*([\d./-]+)/i,
    st:/явка(?:\s+на работу)?\s*[: -]*(\d{1,2}[:.]\d{2})/i,
    et:/окончание работы\s*[: -]*(\d{1,2}[:.]\d{2})/i,
    routeNo:/(?:номер маршрута|маршрут\s*№)\s*[: -]*(\d+)/i,
    weight:/(?:брутто|вес поезда)(?:\s*[,()]?\s*т\b)?\s*[: -]*(\d+)/i,
    axles:/(?:количество осей|ос(?:ей|и))\s*[: -]*(\d+)/i,
    length:/условная длина\s*[: -]*(\d+)/i,
    passTrain:/пассажиром[^\n]*?(?:поезд[ае]?|№)\s*[№ -]*(\d{1,6})/i,
    routeLabel:/участок\s*[:–-]\s*([А-ЯЁ][а-яёА-ЯЁ -]+(?:→|—|–|-)\s*[А-ЯЁ][а-яёА-ЯЁ -]+)/i,
    locoType:/((?:[1234]?ЭС|ЭП|ВЛ|[23]?ТЭ|ТЭМ|ЧС)[А-ЯЁ0-9-]{1,10})/i,
    locoNumber:/(?:номер локомотива|(?:[1234]?ЭС|ЭП|ВЛ|[23]?ТЭ|ЧС)[А-ЯЁ0-9-]+\s*№)\s*[: -]*(\d+)/i
  };
  for(const line of text.split('\n')) for(const [key,re] of Object.entries(patterns)){
    const m=re.exec(line); if(m && normalize(key,m[1])) rows.push({key,value:normalize(key,m[1])});
  }
  const pass=text.match(/пассажиром[^\n]*?(\d{1,2}[:.]\d{2})\s*[-–—]\s*(\d{1,2}[:.]\d{2})/i);
  if(pass) for(const [i,key] of ['passSt','passEt'].entries()){
    const value=normalize(key,pass[i+1]);if(value)rows.push({key,value});
  }
  return rows;
}

function rotate(canvas,turn) {
  if (!turn) return canvas;
  const out=document.createElement('canvas');
  const odd=Math.abs(turn)%2;
  out.width=odd?canvas.height:canvas.width; out.height=odd?canvas.width:canvas.height;
  const c=out.getContext('2d'); c.translate(out.width/2,out.height/2); c.rotate(turn*Math.PI/2);
  c.drawImage(canvas,-canvas.width/2,-canvas.height/2); return out;
}

// Locate ruled columns by their relative widths; a page may be cropped, shifted or scaled.
function layout(canvas) {
  const w=canvas.width,h=canvas.height, pixels=canvas.getContext('2d').getImageData(0,0,w,h).data;
  const ink=new Uint8Array(w*h), gray=new Uint8Array(w*h);
  for(let i=0;i<gray.length;i++) gray[i]=pixels[4*i+1];
  const n=Math.max(5,Math.round(w/100));
  for(let y=n;y<h-n;y++) for(let x=n;x<w-n;x++){
    const i=y*w+x, j=i*4;
    const bg=Math.max(gray[i-n],gray[i+n],gray[i-w*n],gray[i+w*n]);
    if(bg-gray[i]>26 && pixels[j+2]-pixels[j]>5 && pixels[j+2]-gray[i]>4) ink[i]=1;
  }
  const configs={
    face:{steps:[3.25,.56,1,1,1,1,1,1],select:[2,7]},
    meter:{steps:[1.12,.40,1,1,1,1,1],select:[2,3,4,5,6]},
    back:{steps:[1,2.5,2.5,2.5,.75,1,1.24,1.2,1],select:[7,8]}
  };
  const best={};
  for(let y=n*2;y<h-n*2;y+=Math.max(4,Math.round(h/230))){
    const edges=[];
    for(let x=4;x<w-4;x++){
      let hits=0;
      for(let k=-12;k<=12;k+=3){const i=(y+k)*w+x;if(Math.min(gray[i-4],gray[i+4])-gray[i]>18)hits++;}
      if(hits<5)continue;
      if(edges.length && x-edges.at(-1)<5)continue;
      edges.push(x);
    }
    for(const [name,cfg] of Object.entries(configs)){
      for(let start=0;start<edges.length-4;start++){
        const unit=(edges[start+1]-edges[start])/cfg.steps[0];
        if(unit<w*.018||unit>w*.14)continue;
        let col=edges[start], valid=true;const cols=[col];
        for(const step of cfg.steps){
          const want=col+step*unit;
          const match=edges.reduce((a,b)=>Math.abs(b-want)<Math.abs(a-want)?b:a,edges[0]);
          if(Math.abs(match-want)>unit*.175){valid=false;break}
          cols.push(match);col=match;
        }
        if(!valid)continue;
        let score=0;
        for(const k of cfg.select){
          let count=0;
          for(let yy=Math.max(0,y-7);yy<=Math.min(h-1,y+7);yy+=2)
            for(let xx=cols[k]+2;xx<cols[k+1]-2;xx+=2)count+=ink[yy*w+xx];
          score+=Math.min(1,count/(unit*.6));
        }
        if(score<(name==='face'?.34:name==='back'?.48:1.05) || score<=(best[name]?.score||0))continue;
        best[name]={cols,y,unit,score};
      }
    }
  }
  return {best,ink,gray,w,h};
}

// Prepare an enlarged, high-contrast crop of one handwritten entry.
function crop(grid,x0,x1,y0,y1,straighten,penOnly=false,crisp=false) {
  const pts=[];
  const leftEdge=Math.max(0,Math.ceil(x0)+2),rightEdge=Math.min(grid.w,Math.floor(x1)-2);
  for(let y=Math.max(0,Math.floor(y0));y<Math.min(grid.h,y1);y++){
    const row=grid.gray.slice(y*grid.w+leftEdge,y*grid.w+rightEdge).sort();
    const bg=row[Math.floor(row.length*.85)], stroke=[];
    for(let x=leftEdge;x<rightEdge;x++)if(penOnly ? grid.ink[y*grid.w+x] : grid.gray[y*grid.w+x]<bg-38)stroke.push([x,y]);
    if(stroke.length<row.length*.6)pts.push(...stroke);
  }
  if(pts.length<12)return null;
  let mx=0,my=0;
  for(const [x,y] of pts){mx+=x;my+=y} mx/=pts.length;my/=pts.length;
  let xx=0,yy=0,xy=0;
  for(const [x,y] of pts){xx+=(x-mx)**2; yy+=(y-my)**2; xy+=(x-mx)*(y-my)}
  const angle=straighten?Math.atan2(2*xy,xx-yy)/2:0, c=Math.cos(angle),s=Math.sin(angle);
  const points=pts.map(([x,y])=>[(x-mx)*c+(y-my)*s,(y-my)*c-(x-mx)*s]);
  let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
  for(const [x,y] of points){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
  const scale=3, out=document.createElement('canvas');
  out.width=Math.ceil((right-left+1)*scale)+24;out.height=Math.ceil((bottom-top+1)*scale)+24;
  const ctx=out.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,out.width,out.height);ctx.fillStyle='black';
  for(const [x,y] of points){
    const px=12+(x-left)*scale, py=12+(y-top)*scale;
    if(crisp){
      const x0=Math.ceil(px), y0=Math.ceil(py);
      ctx.fillRect(x0,y0,Math.ceil(px+scale+.7)-x0,Math.ceil(py+scale+.7)-y0);
    }else ctx.fillRect(px,py,scale+.7,scale+.7);
  }
  return out;
}

// Average nearby pixels when reducing a crop so thin pen strokes survive.
function compactDigits(tile,height) {
  const out=document.createElement('canvas');
  out.height=Math.min(tile.height,height);
  out.width=Math.max(1,Math.round(tile.width*out.height/tile.height));
  const source=tile.getContext('2d').getImageData(0,0,tile.width,tile.height).data;
  const ctx=out.getContext('2d'), image=ctx.createImageData(out.width,out.height);
  const dx=tile.width/out.width,dy=tile.height/out.height;
  const horizontal=new Uint8ClampedArray(out.width*tile.height);
  for(let y=0;y<tile.height;y++) for(let x=0;x<out.width;x++){
    const center=(x+.5)*dx-.5;
    let sum=0,total=0;
    for(let i=Math.max(0,Math.ceil(center-dx));i<=Math.min(tile.width-1,center+dx);i++){
      const weight=1-Math.abs(i-center)/dx;
      sum+=weight*source[4*(y*tile.width+i)];total+=weight;
    }
    horizontal[y*out.width+x]=Math.round(sum/total);
  }
  for(let y=0;y<out.height;y++) for(let x=0;x<out.width;x++){
    const center=(y+.5)*dy-.5;
    let sum=0,total=0;
    for(let j=Math.max(0,Math.ceil(center-dy));j<=Math.min(tile.height-1,center+dy);j++){
      const weight=1-Math.abs(j-center)/dy;
      sum+=weight*horizontal[j*out.width+x];total+=weight;
    }
    const at=4*(y*out.width+x);
    image.data.fill(Math.round(sum/total),at,at+3);
    image.data[at+3]=255;
  }
  ctx.putImageData(image,0,0);
  return out;
}

export async function readRoute(file,turn,signal,progress) {
  const original=await imageCanvas(file);
  let canvas=rotate(original,turn);
  let grid=layout(canvas), appliedTurn=turn;
  if(!turn && canvas.width>canvas.height && !grid.best.face && !grid.best.meter && !grid.best.back){
    const upright=rotate(original,-1), proposed=layout(upright);
    if(proposed.best.back || (proposed.best.face && proposed.best.meter)){
      canvas=upright;grid=proposed;appliedTurn=3;
    }
  }
  let worker;
  function active(){if(signal.aborted)throw new DOMException('Отменено','AbortError')}
  function stop(){worker?.terminate();worker=null}
  signal.addEventListener('abort',stop,{once:true});
  try {
    active(); const {default:ocr}=await import('./vendor/payslip/ocr.js');
    worker=await ocr.createWorker('rus+eng',1,{workerPath:asset('worker.js'),corePath:asset('tesseract-core-lstm.wasm.js'),langPath:asset(''),workerBlobURL:false,cacheMethod:'none',errorHandler:()=>{}});
    active();
    await worker.setParameters({tessedit_pageseg_mode:'11'});
    const {data}=await worker.recognize(canvas);active();
    const rows=labelled(data.text);
    const {face,meter,back}=grid.best;
    const isFace=meter && (!back || face && face.y<meter.y);
    async function read(key,x0,x1,y0,y1,angle=false){
      active();const tile=crop(grid,x0,x1,y0,y1,angle);if(!tile)return;
      await worker.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:key==='locoType'?'0123456789АБВГДЕЖЗИКЛМНОПРСТУФХЧШЭТ-':'0123456789.,:/- '});
      const picture=document.createElement('canvas');
      picture.width=Math.max(1,Math.ceil(x1-x0));picture.height=Math.max(1,Math.ceil(y1-y0));
      picture.getContext('2d').drawImage(canvas,x0,y0,x1-x0,y1-y0,0,0,picture.width,picture.height);
      const snippet=picture.toDataURL('image/png');
      const candidates=new Set();
      const pen=crop(grid,x0,x1,y0,y1,angle,true);
      for(const sample of [tile,pen]){
        if(!sample)continue;
        active();
        const res=await worker.recognize(sample);
        let raw=res.data.text.trim().replace(/^[~-]\s*/,'');
        if(key==='st'||key==='et')raw=raw.replace(/^(\d{1,2})(\d{2})$/,'$1:$2');
        const value=normalize(key,raw);
        if(value)candidates.add(value);
      }
      if(key==='st'||key==='et'){
        const sharp=crop(grid,x0,x1,y0,y1,angle,false,true);
        for(const [sample,height] of [[sharp,28],[pen,30],[tile,64]]){
          if(!sample)continue;
          active();
          const {data}=await worker.recognize(compactDigits(sample,height));
          const raw=data.text.trim().replace(/^(\d{1,2})(\d{2})$/,'$1:$2');
          const value=normalize(key,raw);
          if(value)candidates.add(value);
        }
      }
      if(key==='weight' && pen){
        // Withhold a weight if the same handwriting gives inconsistent digits.
        const readings=[];
        for(const size of [24,32,48]){
          active();
          const {data}=await worker.recognize(compactDigits(pen,size));
          readings.push(normalize(key,data.text));
        }
        candidates.clear();
        if(readings[0] && readings.every(value=>value===readings[0]))candidates.add(readings[0]);
      }
      if(key==='axles'){
        const sharpPen=crop(grid,x0,x1,y0,y1,angle,true,true);
        if(sharpPen){
          active();
          const {data}=await worker.recognize(sharpPen);
          const value=normalize(key,data.text);
          if(value)candidates.add(value);
        }
      }
      if(candidates.size>3)candidates.clear();
      if(!candidates.size)candidates.add('');
      for(const value of candidates)rows.push({key,value,snippet});
    }
    if(isFace){
      progress('Читаем графы лицевой стороны…');
      if(face && face.y<meter.y){
      const {cols:a,y,unit:u}=face;
      await read('st',a[2],a[3],y-u*.3,y+u*.32);
      await read('et',a[7],a[8],y-u*.35,y+u*.33);
      await read('sd',a[0]-4.5*u,a[0]-u,y-u*.32,y+u*.5);
      }
      const {cols:b,y:v,unit:k}=meter;
      // First handwritten row is above the separator between the two sections.
      let divider=v, strongest=-1;
      const pix=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
      for(let j=Math.max(4,Math.round(v+k*.03));j<Math.min(grid.h-4,v+k*.4);j++){
        let score=0;
        for(let x=b[3]+2;x<b[4]-2;x++){const i=(j*grid.w+x)*4;if(Math.min(pix[i-grid.w*12+1],pix[i+grid.w*12+1])-pix[i+1]>20)score++;}
        if(score>strongest){strongest=score;divider=j;}
      }
      const rowH=k*.30;
      await read('locoNumber',b[2],b[3],divider-rowH,divider-1);
      await read('locoType',b[0],b[1],divider-rowH,divider-1);
      for(let i=0;i<2;i++)for(const [j,key] of ['energyFrom','energyTo','regenFrom','regenTo'].entries())
        await read(i+'_'+key,b[3+j],b[4+j],divider+(i-1)*rowH+1,divider+i*rowH-1);
    }else if(back){
      progress('Читаем массу и оси…');
      const {cols:a,y,unit:u}=back;
      const names=[];
      const sx=Math.max(0,a[0]-u*4.65);
      for(let i=0;i<12;i++){
        const sy=y-u*.46+i*u;
        if(sy<0||sy+u>grid.h)break;
        const tile=crop(grid,sx+5,a[0]-3,sy,sy+u,false,true);
        if(!tile || tile.width<45){if(i>0)break;continue;}
        await worker.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя- '});
        active();
        const r=await worker.recognize(tile);
        const name=r.data.text.trim();
        if(/^[а-яё][а-яё -]{2,35}$/i.test(name) && r.data.confidence>=35)names.push(name);
      }
      if(names.length>=2)rows.push({key:'routeLabel',value:names[0]+' → '+names.at(-1)});
      await read('weight',a[7],a[8],y-u*.65,y+u*.75,true);
      await read('axles',a[8],a[9],y-u*.65,y+u*.75,true);
    }
    // Второй проход (2.43): только синяя ручка на всём листе и числа по смыслу — вес и оси проверяют друг друга.
    progress('Ищем записи синей ручкой…');
    const W=canvas.width,H=canvas.height,{mask,count,walls}=penMask(canvas.getContext('2d').getImageData(0,0,W,H).data,W,H);
    let inkText='';
    if(count>W*H*.0004){
      // каждую запись отдельно: поворачиваем к горизонтали, выпрямляем наклон почерка, делим на цифры
      // и узнаём каждую цифру своей маленькой сетью (tesseract рукописные цифры почти не читает)
      const words=inkWords(mask,W,H,{gap:.9,walls}).sort((a,b)=>a.y-b.y||a.x-b.x).slice(0,160),tokens=[];
      const net=await loadDigits();
      for(const [i,b] of words.entries()){
        if(i%20===0){active();progress(`Читаем записи ручкой: ${i+1} из ${words.length}…`);await new Promise(r=>setTimeout(r));}
        const wm=wordMask(mask,W,H,b);if(!wm.w)continue;
        const r=readDigits(wm.m,wm.w,wm.h,net);
        if(r.digits&&r.digits<=8&&r.conf>=.3)tokens.push({text:r.text,x:b.x,y:b.y,w:b.w,h:b.h,conf:Math.round(r.conf*100)});
      }
      inkText=tokens.map(t=>t.text).join(' ');
      for(const r of classify(tokens,{year:new Date().getFullYear()})){
        let snippet;
        if(r.box){
          const m=Math.round(r.box.h*.6),x=Math.max(0,r.box.x-m),y=Math.max(0,r.box.y-m);
          const c=document.createElement('canvas');c.width=Math.min(W-x,r.box.w+2*m);c.height=Math.min(H-y,r.box.h+2*m);
          c.getContext('2d').drawImage(canvas,x,y,c.width,c.height,0,0,c.width,c.height);snippet=c.toDataURL('image/png');
        }
        rows.push({key:r.key,value:r.value,why:r.why,snippet});
      }
    }
    active();return {rows,text:data.text+(inkText.trim()?'\n\nСиней ручкой:\n'+inkText.trim():''),turn:appliedTurn};
  }finally{signal.removeEventListener('abort',stop);stop();canvas.width=original.width=1;}
}
