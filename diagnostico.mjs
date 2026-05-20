
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

async function dump(page, titulo, selector){
  const items = await page.locator(selector).evaluateAll(els => els.slice(0,50).map(e => ({
    tag: e.tagName.toLowerCase(),
    role: e.getAttribute('role') || '',
    ariaDisabled: e.getAttribute('aria-disabled') || '',
    disabled: e.disabled === true,
    cls: (e.className && e.className.toString ? e.className.toString() : '').slice(0,90),
    text: (e.textContent || '').trim().replace(/\s+/g,' ').slice(0,60),
  }))).catch(() => []);
  add(`\n### ${titulo}  [${selector}] -> ${items.length}`);
  items.forEach((it,i)=> add(`  [${i}] <${it.tag}> role="${it.role}" disabled=${it.disabled} aria="${it.ariaDisabled}" cls="${it.cls}" txt="${it.text}"`));
}

async function dumpComprar(page){
  const cands = await page.evaluate(()=>{
    const r=[];
    document.querySelectorAll('button,a,div,span,[role="button"]').forEach(e=>{
      const txt=(e.textContent||'').trim();
      if(/comprar/i.test(txt) && txt.length<40){
        r.push({tag:e.tagName.toLowerCase(), role:e.getAttribute('role')||'', cls:(e.className||'').toString().slice(0,80), txt:txt.slice(0,40), html:e.outerHTML.slice(0,180)});
      }
    });
    return r.slice(0,15);
  }).catch(()=>[]);
  add(`\n### Candidatos "Comprar" (${cands.length})`);
  cands.forEach((c,i)=> add(`  [${i}] <${c.tag}> role="${c.role}" cls="${c.cls}" txt="${c.txt}"\n      html=${c.html}`));
}

async function clickComprar(page){
  const cands = [
    page.getByRole('button',{name:/comprar/i}),
    page.getByRole('link',{name:/comprar/i}),
    page.getByText(/^\s*comprar\s*$/i),
    page.locator(':text("Comprar")'),
  ];
  for (const c of cands){
    if (await c.count().catch(()=>0)){
      try{ await c.first().click({timeout:6000}); add('Comprar OK'); return true; }
      catch(e){ add('Comprar intento: '+e.message); }
    }
  }
  const ok = await page.evaluate(()=>{
    const els=[...document.querySelectorAll('button,a,div,span,[role="button"]')];
    const t=els.find(e=>/comprar/i.test((e.textContent||'').trim()) && (e.textContent||'').trim().length<40 && e.offsetParent!==null);
    if(t){ t.click(); return true; } return false;
  }).catch(()=>false);
  add('Comprar por JS: '+ok);
  return ok;
}

async function abrirPorEtiqueta(page, etiqueta){
  const lbl = page.getByText(etiqueta, { exact:false }).first();
  await lbl.scrollIntoViewIfNeeded().catch(()=>{});
  const ctrl = lbl.locator('xpath=following::*[self::div or self::button or self::input or self::span][1]');
  await ctrl.click({ timeout:8000 }).catch(e=>add('click '+etiqueta+': '+e.message));
  await page.waitForTimeout(1000);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ locale:'es-PE' });
  page.setDefaultTimeout(15000);
  try {
    add('== DIAGNOSTICO v2 '+new Date().toISOString()+' ==');
    await page.goto(URL, { waitUntil:'domcontentloaded', timeout:60000 });
    await page.waitForTimeout(5000);
    await shot(page,'home');
    fs.writeFileSync('00-home.html', await page.content());

    await dumpComprar(page);
    await dump(page,'HOME botones','button');
    await dump(page,'HOME links','a');

    for (const t of [/aceptar/i,/accept/i,/entendido/i]){
      const b = page.getByRole('button',{name:t}); if(await b.count().catch(()=>0)){ await b.first().click().catch(()=>{}); }
    }

    const abrio = await clickComprar(page);
    await page.waitForTimeout(2500);
    await shot(page,'modal');
    fs.writeFileSync('01-modal.html', await page.content());
    if(!abrio) add('No abrio el modal: revisa 00-home.html y los candidatos.');

    await dump(page,'Selects nativos','select');
    await dump(page,'Opciones select','select option');

    await abrirPorEtiqueta(page,'Selecciona el circuito');
    await shot(page,'circuito-abierto');
    await dump(page,'CIRCUITO role=option','[role="option"]');
    await dump(page,'CIRCUITO li','ul li');
    await dump(page,'CIRCUITO mat/ng/p','mat-option, .mat-option, .ng-option, .p-dropdown-item');
    fs.writeFileSync('02-circuito.html', await page.content());
    await page.getByText(CIRCUITO,{exact:false}).first().click({timeout:8000}).catch(e=>add('pick circuito: '+e.message));
    await page.waitForTimeout(900);

    await abrirPorEtiqueta(page,'ruta de tu recorrido');
    await shot(page,'ruta-abierta');
    await dump(page,'RUTA role=option','[role="option"]');
    await dump(page,'RUTA li','ul li');
    await page.getByText(RUTA,{exact:false}).first().click({timeout:8000}).catch(e=>add('pick ruta: '+e.message));
    await page.waitForTimeout(900);

    const campoFecha = page.getByText('fecha de tu visita',{exact:false}).first().locator('xpath=following::*[1]');
    await campoFecha.click().catch(e=>add('abrir calendario: '+e.message));
    await page.waitForTimeout(1500);
    await shot(page,'calendario');
    fs.writeFileSync('03-calendario.html', await page.content());
    await dump(page,'CAL gridcell','[role="gridcell"]');
    await dump(page,'CAL td','table td');
    await dump(page,'CAL botones','button');

    for (let i=0;i<6;i++){
      const enJulio = await page.getByText(/JUL\.?\s*2026/i).count().catch(()=>0);
      if (enJulio>0){ add('Julio 2026 a la vista'); break; }
      const next = page.getByRole('button',{name:/next|siguiente/i}).first();
      if (await next.count().catch(()=>0)) await next.click().catch(()=>{});
      else { const fl = page.locator('button:has-text(">"), button:has-text("\u203a")'); if(await fl.count().catch(()=>0)>1) await fl.nth(1).click().catch(()=>{}); }
      await page.waitForTimeout(700);
    }
    await shot(page,'julio');
    fs.writeFileSync('04-julio.html', await page.content());
    await dump(page,'JUL gridcell','[role="gridcell"]');
    await dump(page,'JUL botones','button');

    for (const d of ['21','22','23','24','25']){
      const cel = page.getByText(new RegExp('^\\s*'+d+'\\s*$')).last();
      if (await cel.count().catch(()=>0)){ await cel.click().catch(()=>{}); await page.waitForTimeout(1200); add('Clique dia '+d); break; }
    }
    await shot(page,'dia-elegido');

    await abrirPorEtiqueta(page,'horario de ingreso');
    await shot(page,'horarios');
    await dump(page,'HORARIOS role=option','[role="option"]');
    await dump(page,'HORARIOS li','ul li');
    fs.writeFileSync('05-horarios.html', await page.content());

    const texto = (await page.evaluate(()=>document.body.innerText)) || '';
    add('\n### TEXTO VISIBLE (recorte):\n'+texto.replace(/\s+/g,' ').slice(0,1500));

  } catch(e){
    add('ERROR GENERAL: '+e.message);
    await shot(page,'error');
  } finally {
    fs.writeFileSync('diagnostico.txt', out.join('\n'));
    await browser.close();
  }
})();
