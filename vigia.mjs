import { chromium } from 'playwright';

// ===== CONFIG =====
const URL  = 'https://tuboleto.cultura.pe/llaqta_machupicchu';
const MES  = 5;            // 5=mayo, 7=julio
const ANIO = 2026;
const DIAS = [21,22,23,24,25];
// ==================

const ABBR=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const mesRx=new RegExp(ABBR[MES-1],'i');
const anioRx=new RegExp(String(ANIO));
const log=(...a)=>console.log(new Date().toISOString(),...a);

async function tg(text){
  const T=process.env.TELEGRAM_TOKEN, C=process.env.TELEGRAM_CHAT_ID;
  if(!T||!C){ log('Falta TELEGRAM_TOKEN/CHAT_ID'); return; }
  try{
    const r=await fetch(`https://api.telegram.org/bot${T}/sendMessage`,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({chat_id:C,text,parse_mode:'HTML',disable_web_page_preview:true})
    });
    log('Telegram',r.status);
  }catch(e){ log('Telegram error',e.message); }
}

async function opciones(page, idx){
  const sel=page.locator('mat-select').nth(idx);
  await sel.click({timeout:8000});
  await page.waitForTimeout(700);
  const ops=(await page.getByRole('option').allTextContents().catch(()=>[])).map(s=>s.replace(/\s+/g,' ').trim()).filter(Boolean);
  await page.keyboard.press('Escape').catch(()=>{});
  await page.waitForTimeout(300);
  return ops;
}

async function elegir(page, idx, optIdx){
  const sel=page.locator('mat-select').nth(idx);
  await sel.click({timeout:8000});
  await page.waitForTimeout(700);
  await page.getByRole('option').nth(optIdx).click({timeout:8000});
  await page.waitForTimeout(900);
}

async function abrirCalEnMes(page){
  if(await page.locator('.mat-calendar').count().catch(()=>0)===0){
    const tgl=page.locator('mat-datepicker-toggle button').first();
    if(await tgl.count().catch(()=>0)) await tgl.click({timeout:5000}).catch(()=>{});
    if(await page.locator('.mat-calendar').count().catch(()=>0)===0)
      await page.locator('input.mat-datepicker-input').first().click({timeout:5000}).catch(()=>{});
  }
  await page.locator('.mat-calendar').first().waitFor({timeout:8000}).catch(()=>{});
  for(let i=0;i<14;i++){
    const lbl=(await page.locator('.mat-calendar-period-button').first().textContent().catch(()=>''))||'';
    if(mesRx.test(lbl)&&anioRx.test(lbl)) break;
    await page.locator('.mat-calendar-next-button').first().click().catch(()=>{});
    await page.waitForTimeout(500);
  }
}

async function revisaCombo(page){
  await abrirCalEnMes(page);
  const abiertos=[];
  for(const d of DIAS){
    const cell=page.locator('.mat-calendar-body-cell',{hasText:new RegExp('^\\s*'+d+'\\s*$')}).first();
    if(await cell.count().catch(()=>0)===0) continue;
    const dis=await cell.evaluate(el=>el.getAttribute('aria-disabled')==='true'||/mat-calendar-body-disabled/.test(el.className||'')).catch(()=>true);
    if(!dis) abiertos.push(d);
  }
  let cupo=false, muestra=[];
  if(abiertos.length){
    try{
      await page.locator('.mat-calendar-body-cell',{hasText:new RegExp('^\\s*'+abiertos[0]+'\\s*$')}).first().click({timeout:5000});
      await page.waitForTimeout(1500);
      await page.locator('mat-select').nth(2).click({timeout:5000});
      await page.waitForTimeout(1000);
      const ops=(await page.getByRole('option').allTextContents().catch(()=>[])).map(s=>s.replace(/\s+/g,' ').trim()).filter(Boolean);
      await page.keyboard.press('Escape').catch(()=>{});
      muestra=ops.filter(t=>!/agotado/i.test(t));
      cupo=muestra.length>0;
    }catch(e){ log('drill',e.message); }
  }
  await page.keyboard.press('Escape').catch(()=>{});
  await page.waitForTimeout(300);
  return {abiertos,cupo,muestra};
}

(async()=>{
  const browser=await chromium.launch();
  const page=await browser.newPage({locale:'es-PE'});
  page.setDefaultTimeout(15000);
  try{
    await page.goto(URL,{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForTimeout(5000);
    if(await page.locator('mat-select').count().catch(()=>0)===0){
      await page.getByRole('button',{name:/comprar/i}).first().click({timeout:6000}).catch(()=>{});
      await page.waitForTimeout(1500);
    }

    const circuitos=await opciones(page,0);
    log('Circuitos:',circuitos.length);
    const resultados=[];

    for(let ci=0; ci<circuitos.length; ci++){
      await elegir(page,0,ci);
      await page.keyboard.press('Escape').catch(()=>{});
      await page.waitForTimeout(400);
      const rutas=await opciones(page,1);
      for(let rj=0; rj<rutas.length; rj++){
        try{
          await elegir(page,1,rj);
          const {abiertos,cupo,muestra}=await revisaCombo(page);
          log(`${circuitos[ci]} / ${rutas[rj]} ->`, abiertos.length?`ABIERTO ${abiertos.join(',')} cupo=${cupo}`:'cerrado');
          if(abiertos.length) resultados.push({c:circuitos[ci], r:rutas[rj], abiertos, cupo, muestra});
        }catch(e){ log('combo error',e.message); await page.keyboard.press('Escape').catch(()=>{}); await page.waitForTimeout(300); }
      }
    }

    if(resultados.length){
      const lineas=resultados.map(x=>{
        const estado = x.cupo
          ? `✅ CON CUPO (${x.muestra.slice(0,5).join(' | ')})`
          : `⚠️ abierta, verifica (día ${x.abiertos[0]} salía agotado)`;
        return `• ${x.c} / ${x.r}: días ${x.abiertos.join(', ')} — ${estado}`;
      }).join('\n');
      await tg(`🏔️ <b>¡Fechas ABIERTAS en Machupicchu!</b> (${ABBR[MES-1].toUpperCase()}. ${ANIO})\n${lineas}\n\n👉 Compren YA: ${URL}`);
      log('ALERTA',resultados.length);
    } else {
      log('Nada abierto en',DIAS.join(','));
    }
  }catch(e){ log('ERROR',e.message); }
  finally{ await browser.close(); }
})();
