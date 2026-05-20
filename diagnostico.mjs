// ============================================================
//  DIAGNÓSTICO — Machu Picchu (tuboleto / llaqta)
//  Abre la web, despliega cada control y EXTRAE su estructura real
//  a "diagnostico.txt" (+ capturas + HTML completo de respaldo).
//  Con eso se escriben los selectores correctos del monitor final.
//  Es de un solo uso: córrelo a mano, mándame el resultado.
// ============================================================

import { chromium } from 'playwright';
import fs from 'fs';

const URL      = 'https://tuboleto.cultura.pe/llaqta_machupicchu';
const CIRCUITO = 'Circuito 3 - Machupicchu realeza';
const RUTA     = 'Ruta 3-B';

const out = [];
const add = (l) => { out.push(l); console.log(l); };
let paso = 0;
async function shot(page, n){ paso++; const f=`step-${String(paso).padStart(2,'0')}-${n}.png`;
  try{ await page.screenshot({path:f,fullPage:true}); add('captura '+f);}catch(e){ add('shot fail '+n+': '+e.message);} }

// Vuelca, de un selector, los primeros elementos con su tipo/clase/estado/texto.
async function dump(page, titulo, selector){
  const items = await page.locator(selector).evaluateAll(els => els.slice(0,50).map(e => ({
    tag: e.tagName.toLowerCase(),
    role: e.getAttribute('role') || '',
    ariaDisabled: e.getAttribute('aria-disabled') || '',
    disabled: e.disabled === true,
    cls: (e.className && e.className.toString ? e.className.toString() : '').slice(0,90),
    text: (e.textContent || '').trim().replace(/\s+/g,' ').slice(0,60),
  }))).catch(() => []);
  add(`\n### ${titulo}  [selector: ${selector}] -> ${items.length} elementos`);
  items.forEach((it,i)=> add(`  [${i}] <${it.tag}> role="${it.role}" disabled=${it.disabled} aria-disabled="${it.ariaDisabled}" cls="${it.cls}" txt="${it.text}"`));
}

async function abrirPorEtiqueta(page, etiqueta){
  const lbl = page.getByText(etiqueta, { exact:false }).first();
  await lbl.scrollIntoViewIfNeeded();
  const ctrl = lbl.locator('xpath=following::*[self::div or self::button or self::input or self::span][1]');
  await ctrl.click({ timeout:10000 }).catch(e=>add('click '+etiqueta+': '+e.message));
  await page.waitForTimeout(1000);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ locale:'es-PE' });
  page.setDefaultTimeout(15000);
  try {
    add('== DIAGNÓSTICO '+new Date().toISOString()+' ==');
    await page.goto(URL, { waitUntil:'networkidle', timeout:60000 });
    await shot(page,'home');

    await page.getByRole('button',{name:/comprar/i}).first().click();
    await page.waitForTimeout(2500);
    await shot(page,'modal');
    fs.writeFileSync('01-modal.html', await page.content());

    // Estructura general de los campos
    await dump(page,'¿Hay <select> nativos?','select');
    await dump(page,'Opciones de <select> nativos','select option');
    await dump(page,'Inputs','input');

    // Desplegable de CIRCUITO abierto
    await abrirPorEtiqueta(page,'Selecciona el circuito');
    await shot(page,'circuito-abierto');
    await dump(page,'CIRCUITO: opciones (role=option)','[role="option"]');
    await dump(page,'CIRCUITO: opciones (li)','ul li');
    await dump(page,'CIRCUITO: opciones (mat/ng)','mat-option, .mat-option, .ng-option, .p-dropdown-item');
    fs.writeFileSync('02-circuito.html', await page.content());

    // Elegir circuito 3
    await page.getByText(CIRCUITO,{exact:false}).first().click({timeout:8000}).catch(e=>add('pick circuito: '+e.message));
    await page.waitForTimeout(900);

    // Desplegable de RUTA abierto
    await abrirPorEtiqueta(page,'ruta de tu recorrido');
    await shot(page,'ruta-abierta');
    await dump(page,'RUTA: opciones (role=option)','[role="option"]');
    await dump(page,'RUTA: opciones (li)','ul li');
    await page.getByText(RUTA,{exact:false}).first().click({timeout:8000}).catch(e=>add('pick ruta: '+e.message));
    await page.waitForTimeout(900);

    // CALENDARIO
    const campoFecha = page.getByText('fecha de tu visita',{exact:false}).first().locator('xpath=following::*[1]');
    await campoFecha.click().catch(e=>add('abrir calendario: '+e.message));
    await page.waitForTimeout(1500);
    await shot(page,'calendario');
    fs.writeFileSync('03-calendario.html', await page.content());
    await dump(page,'CALENDARIO: celdas (gridcell)','[role="gridcell"]');
    await dump(page,'CALENDARIO: celdas (td)','table td');
    await dump(page,'CALENDARIO: botones de día','button');

    // Ir a JULIO 2026
    for (let i=0;i<6;i++){
      const enJulio = await page.getByText(/JUL\.?\s*2026/i).count();
      if (enJulio>0){ add('Julio 2026 a la vista'); break; }
      const next = page.getByRole('button',{name:/next|siguiente/i}).first();
      if (await next.count()) await next.click().catch(()=>{});
      else { const fl = page.locator('button:has-text(">"), button:has-text("\u203a")'); if(await fl.count()>1) await fl.nth(1).click().catch(()=>{}); }
      await page.waitForTimeout(700);
    }
    await shot(page,'julio');
    fs.writeFileSync('04-julio.html', await page.content());
    await dump(page,'JULIO: celdas (gridcell)','[role="gridcell"]');
    await dump(page,'JULIO: botones de día','button');

    // Intentar abrir un día disponible para ver horarios + cupos
    for (const d of ['21','22','23','24','25']){
      const cel = page.getByText(new RegExp('^\\s*'+d+'\\s*$')).last();
      if (await cel.count()){
        await cel.click().catch(()=>{});
        await page.waitForTimeout(1200);
        add('Cliqué día '+d);
        break;
      }
    }
    await shot(page,'dia-elegido');

    await abrirPorEtiqueta(page,'horario de ingreso');
    await shot(page,'horarios');
    await dump(page,'HORARIOS: opciones (role=option)','[role="option"]');
    await dump(page,'HORARIOS: opciones (li)','ul li');
    fs.writeFileSync('05-horarios.html', await page.content());

    // Texto visible (a veces los cupos salen como "X disponibles")
    const texto = (await page.evaluate(()=>document.body.innerText)) || '';
    add('\n### TEXTO VISIBLE DEL MODAL (recorte):\n'+texto.replace(/\s+/g,' ').slice(0,1500));

  } catch(e){
    add('ERROR GENERAL: '+e.message);
    await shot(page,'error');
  } finally {
    fs.writeFileSync('diagnostico.txt', out.join('\n'));
    await browser.close();
  }
})();
