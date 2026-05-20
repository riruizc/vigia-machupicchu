
import { chromium } from 'playwright';
import fs from 'fs';

const URL = 'https://tuboleto.cultura.pe/llaqta_machupicchu';
const MES_RX = /may/i;      // mes objetivo: MAYO
const ANIO_RX = /2026/;
const DIAS = ['21','22','23','24','25'];

const out = [];
const add = (l) => { out.push(l); console.log(l); };
let paso = 0;
async function shot(page, n){ paso++; const f=`step-${String(paso).padStart(2,'0')}-${n}.png`;
  try{ await page.screenshot({path:f,fullPage:true}); add('captura '+f);}catch(e){ add('shot fail '+n+': '+e.message);} }

async function dump(page, titulo, selector){
  const items = await page.locator(selector).evaluateAll(els => els.slice(0,60).map(e => ({
    tag: e.tagName.toLowerCase(),
    aria: e.getAttribute('aria-disabled') || '',
    disabled: e.disabled === true,
    cls: (e.className && e.className.toString ? e.className.toString() : '').slice(0,70),
    text: (e.textContent || '').trim().replace(/\s+/g,' ').slice(0,60),
  }))).catch(() => []);
  add(`\n### ${titulo}  [${selector}] -> ${items.length}`);
  items.forEach((it,i)=> add(`  [${i}] <${it.tag}> dis=${it.disabled} aria="${it.aria}" cls="${it.cls}" txt="${it.text}"`));
}

async function elegirSelect(page, idx, rx, etiqueta){
  try{
    const sel = page.locator('mat-select').nth(idx);
    await sel.scrollIntoViewIfNeeded().catch(()=>{});
    await sel.click({timeout:8000});
    await page.waitForTimeout(900);
    await dump(page, 'OPCIONES '+etiqueta, '[role="option"]');
    const opt = (rx ? page.getByRole('option',{name:rx}) : page.getByRole('option')).first();
    await opt.click({timeout:8000});
    add('OK '+etiqueta);
    await page.waitForTimeout(1000);
  }catch(e){ add('elegirSelect '+etiqueta+': '+e.message); await page.keyboard.press('Escape').catch(()=>{}); await page.waitForTimeout(400); }
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ locale:'es-PE' });
  page.setDefaultTimeout(15000);
  try {
    add('== DIAG v4 (MAYO) '+new Date().toISOString()+' ==');
    await page.goto(URL, { waitUntil:'domcontentloaded', timeout:60000 });
    await page.waitForTimeout(5000);

    if (await page.locator('mat-select').count().catch(()=>0) === 0){
      await page.getByRole('button',{name:/comprar/i}).first().click({timeout:6000}).catch(e=>add('comprar: '+e.message));
      await page.waitForTimeout(1500);
    }
    await shot(page,'home');
    await dump(page,'mat-select presentes','mat-select');

    await elegirSelect(page, 0, /Circuito 3/i, 'circuito');
    await elegirSelect(page, 1, /3-?B/i, 'ruta');

    const toggle = page.locator('mat-datepicker-toggle button, button[aria-label*="calend" i]').first();
    if (await toggle.count().catch(()=>0)) await toggle.click().catch(e=>add('toggle: '+e.message));
    else await page.locator('input.mat-datepicker-input, input[data-mat-calendar]').first().click().catch(e=>add('input cal: '+e.message));
    await page.waitForTimeout(1200);
    await shot(page,'calendario');

    for (let i=0;i<10;i++){
      const lbl = (await page.locator('.mat-calendar-period-button').first().textContent().catch(()=> '')) || '';
      add('periodo: "'+lbl.trim()+'"');
      if (MES_RX.test(lbl) && ANIO_RX.test(lbl)) break;
      await page.locator('.mat-calendar-next-button').first().click().catch(e=>add('next: '+e.message));
      await page.waitForTimeout(700);
    }
    await dump(page,'CELDAS mes objetivo','.mat-calendar-body-cell');

    let dia=null;
    for (const d of DIAS){
      const cell = page.locator('.mat-calendar-body-cell', { hasText: new RegExp('^\\s*'+d+'\\s*$') }).first();
      if (await cell.count().catch(()=>0)){
        const dis = await cell.evaluate(el => el.disabled===true || el.getAttribute('aria-disabled')==='true' || /disabled/i.test(el.className||'')).catch(()=>true);
        add('dia '+d+' disabled='+dis);
        if (!dis && dia===null){ await cell.click().catch(()=>{}); dia=d; add('cliqué dia '+d); }
      } else add('dia '+d+' NO encontrado');
    }
    await page.waitForTimeout(1500);
    await shot(page,'fecha');

    if (dia){
      await elegirSelect(page, 2, null, 'horario');
      await elegirSelect(page, 3, null, 'procedencia');
      await page.waitForTimeout(2000);
      await shot(page,'todo');
      await dump(page,'inputs','input');
      await dump(page,'posibles cupos/tarifas','[class*="cupo"],[class*="tarifa"],[class*="entrada"],[class*="disponib"],[class*="stock"],[class*="aforo"],[class*="cantidad"]');
    } else {
      add('Ningun dia 21-25 disponible/clickable.');
    }

    const texto = (await page.evaluate(()=>document.body.innerText)) || '';
    add('\n### TEXTO VISIBLE FINAL:\n'+texto.replace(/\s+/g,' ').slice(0,2500));

  } catch(e){
    add('ERROR GENERAL: '+e.message);
    await shot(page,'error');
  } finally {
    fs.writeFileSync('diagnostico.txt', out.join('\n'));
    await browser.close();
  }
})();

