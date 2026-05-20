import { chromium } from 'playwright';

// ===== CONFIG (edita aquí) =====
const URL       = 'https://tuboleto.cultura.pe/llaqta_machupicchu';
const CIRCUITO  = /Circuito 3/i;
const RUTA      = /3-?B/i;
const MES       = 5;          // 5=mayo, 7=julio
const ANIO      = 2026;
const DIAS      = [21,22,23,24,25];
const MIN_CUPOS = 5;
// ===============================

const ABBR = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const mesRx = new RegExp(ABBR[MES-1],'i');
const anioRx = new RegExp(String(ANIO));
const log = (...a)=>console.log(new Date().toISOString(), ...a);

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

async function elegir(page, idx, rx){
  const sel=page.locator('mat-select').nth(idx);
  await sel.scrollIntoViewIfNeeded().catch(()=>{});
  await sel.click({timeout:8000});
  await page.waitForTimeout(800);
  await page.getByRole('option',{name:rx}).first().click({timeout:8000});
  await page.waitForTimeout(900);
}

async function disponible(page, d){
  const cell=page.locator('.mat-calendar-body-cell',{hasText:new RegExp('^\\s*'+d+'\\s*$')}).first();
  if(await cell.count().catch(()=>0)===0) return null;
  const dis=await cell.evaluate(el=>el.getAttribute('aria-disabled')==='true'||/mat-calendar-body-disabled/.test(el.className||'')).catch(()=>true);
  return !dis;
}

async function horariosDe(page, d){
  try{
    await page.locator('.mat-calendar-body-cell',{hasText:new RegExp('^\\s*'+d+'\\s*$')}).first().click({timeout:5000});
    await page.waitForTimeout(1500);
    await page.locator('mat-select').nth(2).click({timeout:5000});
    await page.waitForTimeout(1000);
    const ops=await page.getByRole('option').allTextContents().catch(()=>[]);
    await page.keyboard.press('Escape').catch(()=>{});
    return ops.map(s=>s.trim()).filter(Boolean);
  }catch(e){ return []; }
}

(async()=>{
  const browser=await chromium.launch();
  const page=await browser.newPage({locale:'es-PE'});
  page.setDefaultTimeout(15000);
  let alerta=false;
  try{
    await page.goto(URL,{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForTimeout(5000);

    if(await page.locator('mat-select').count().catch(()=>0)===0){
      await page.getByRole('button',{name:/comprar/i}).first().click({timeout:6000}).catch(()=>{});
      await page.waitForTimeout(1500);
    }

    await elegir(page,0,CIRCUITO);
    await elegir(page,1,RUTA);

    if(await page.locator('.mat-calendar').count().catch(()=>0)===0){
      const tgl=page.locator('mat-datepicker-toggle button').first();
      if(await tgl.count().catch(()=>0)) await tgl.click({timeout:5000}).catch(()=>{});
    }
    if(await page.locator('.mat-calendar').count().catch(()=>0)===0){
      await page.locator('input.mat-datepicker-input').first().click({timeout:5000}).catch(()=>{});
    }
    await page.locator('.mat-calendar').first().waitFor({timeout:8000}).catch(()=>{});

    for(let i=0;i<14;i++){
      const lbl=(await page.locator('.mat-calendar-period-button').first().textContent().catch(()=>''))||'';
      if(mesRx.test(lbl)&&anioRx.test(lbl)) break;
      await page.locator('.mat-calendar-next-button').first().click().catch(()=>{});
      await page.waitForTimeout(600);
    }
    const periodo=((await page.locator('.mat-calendar-period-button').first().textContent().catch(()=>''))||'').trim();
    log('Mes:',periodo);

    const libres=[];
    for(const d of DIAS){
      const ok=await disponible(page,d);
      log(`dia ${d}:`, ok===null?'no encontrado':(ok?'DISPONIBLE':'agotado'));
      if(ok) libres.push(d);
    }

    if(libres.length){
      let detalle='';
      const hs=await horariosDe(page,libres[0]);
      if(hs.length) detalle=`\nHorarios en ${libres[0]}: ${hs.slice(0,6).join(' | ')}`;
      await tg(
        `🏔️ <b>¡CUPOS Machupicchu!</b>\nCircuito 3 / Ruta 3-B\n`+
        `Días libres (${periodo}): <b>${libres.join(', ')}</b>${detalle}\n\n`+
        `👉 Compren YA (necesitan ${MIN_CUPOS}): ${URL}`
      );
      alerta=true;
    }
    log(alerta?'ALERTA enviada':'Sin disponibilidad');
  }catch(e){ log('ERROR',e.message); }
  finally{ await browser.close(); }
})();
