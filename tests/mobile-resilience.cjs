'use strict';
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../web');
const server = http.createServer((req,res) => {
  const filename = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname === '/' ? '/index.html' : new URL(req.url, 'http://localhost').pathname));
  if (!filename.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(filename,(err,data)=>{ if(err){res.writeHead(404).end();return;} const ext=path.extname(filename);res.setHeader('content-type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.geojson':'application/json','.png':'image/png'})[ext]||'application/octet-stream');res.end(data); });
});
async function run(){
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true});
  try {
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    const page=await context.newPage(); let requests=[]; let releaseGreen; let greenBlocked=new Promise(r=>releaseGreen=r);
    page.on('request',r=>requests.push(r.url()));
    await page.route('**/*',async route=>{const u=route.request().url();if(!u.startsWith(origin)){await route.abort();return;}if(u.includes('/ser-data/green.geojson')){await greenBlocked;await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({type:'FeatureCollection',features:[]})});return;}await route.continue();});
    await page.goto(origin,{waitUntil:'domcontentloaded'});
    await page.locator('#public-parking:not([disabled])').waitFor();
    await page.locator('.ser_legend_toggle').waitFor();
    assert.equal(await page.locator('.ser_legend_toggle').getAttribute('aria-expanded'),'false');
    assert.equal(requests.some(x=>/objects\.geojson|ser-data\/(green|blue|gray|meters)\.geojson/.test(x)),false,'large layers must not be fetched on initial load');
    await page.locator('.ser_legend_toggle').click(); assert.equal(await page.locator('.ser_legend_toggle').getAttribute('aria-expanded'),'true');
    await page.locator('.ser_legend_toggle').click();
    const greenRequest=page.waitForRequest('**/ser-data/green.geojson');
    await page.locator('#all-ser').click();
    await greenRequest;
    assert.match(await page.locator('#data-status').innerText(),/Cargando/);
    await page.locator('#parking-search').fill('Orense');
    await page.getByRole('heading',{name:'Aparcamiento mixto. Orense'}).waitFor();
    assert.equal(await page.locator('#all-ser').getAttribute('aria-pressed'),'true');
    releaseGreen();
    await page.locator('#parking-search').fill('');
    await page.locator('#public-parking').click(); assert.equal(await page.locator('#public-parking').getAttribute('aria-pressed'),'false');
    await page.locator('#public-parking').click();
    await page.locator('#choose-destination').click();
    const box=await page.locator('#map').boundingBox(); await page.mouse.click(box.x+box.width*.8,box.y+box.height*.7);
    await page.getByRole('heading',{name:'Opciones cerca del destino'}).waitFor();
    await page.locator('.parking-card .distance').first().waitFor();
    assert.match(await page.locator('.parking-card .distance').first().innerText(),/en línea recta/);
    await page.locator('#clear-destination').click();
    assert.equal(await page.locator('#destination-notice').isHidden(),true);
    await context.close();
    const retryContext=await browser.newContext({viewport:{width:390,height:844}}); const retryPage=await retryContext.newPage(); let attempts=0;
    await retryPage.route('**/*',async route=>{let u=route.request().url();if(!u.startsWith(origin)){await route.abort();return;}if(u.includes('/ser-data/orange.geojson') && attempts++===0){await route.abort();return;}await route.continue();});
    await retryPage.goto(origin,{waitUntil:'domcontentloaded'});
    await retryPage.locator('#retry-data').waitFor({state:'visible'});
    assert.match(await retryPage.locator('#data-status').innerText(),/Datos incompletos/);
    await retryPage.locator('#retry-data').click();
    await retryPage.locator('#retry-data').waitFor({state:'hidden'});
    assert.ok(attempts>=2,'retry must request failed layer again');
    await retryContext.close();
    console.log('Mobile interactions, lazy loading, slow layer and retry: PASS');
  } finally {await browser.close();await new Promise(r=>server.close(r));}
}
run().catch(error=>{console.error(error);server.close();process.exitCode=1;});
