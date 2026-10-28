'use strict';
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../web');
const zone = {type:'Polygon',coordinates:[[[-3.702,40.399],[-3.698,40.399],[-3.698,40.402],[-3.702,40.402],[-3.702,40.399]]]};
const feature = (geometry, properties) => ({type:'Feature',geometry,properties});
const featureCollection = features => ({type:'FeatureCollection',features});
const fixtures = {
  '/objects.geojson': featureCollection([feature({type:'Polygon',coordinates:[[[-3.702,40.399],[-3.701,40.399],[-3.701,40.401],[-3.702,40.401],[-3.702,40.399]]]}, {Color:'Naranja',OBJECTID:801,zona:'1'})]),
  '/ser-data/orange.geojson': featureCollection([feature({type:'Polygon',coordinates:[[[-3.702,40.399],[-3.701,40.399],[-3.701,40.401],[-3.702,40.401],[-3.702,40.399]]]}, {Color:'Naranja',OBJECTID:801,zona:'1'})]),
  '/disuasorios.geojson': featureCollection([feature({type:'Point',coordinates:[-3.711,40.4]}, {kind:'municipal_park_ride',name:'Disuasorio del origen',minHours:0,maxHours:12,freeWhenEligible:true})]),
  '/aparcat.geojson': featureCollection([feature({type:'Point',coordinates:[-3.712,40.4]}, {kind:'regional_park_ride',name:'Aparca+T',minHours:0,maxHours:12,freeWhenEligible:true})]),
  '/parkings-publicos.geojson': featureCollection([feature({type:'Point',coordinates:[-3.6996,40.4]}, {kind:'municipal_public_parking',name:'Parking público de prueba'})]),
  '/zbe-madrid.geojson': featureCollection([feature(zone,{})]),
  '/zbedep-centro.geojson': featureCollection([]),
  '/zbedep-plaza-eliptica.geojson': featureCollection([])
};
const server = http.createServer((req,res) => {
  const url = new URL(req.url,'http://localhost');
  const pathname = decodeURIComponent(url.pathname);
  if (fixtures[pathname]) { res.writeHead(200,{'content-type':'application/geo+json'}).end(JSON.stringify(fixtures[pathname])); return; }
  const filename = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!filename.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(filename,(err,data) => {
    if (err) { res.writeHead(404).end(); return; }
    const ext = path.extname(filename);
    res.writeHead(200,{'content-type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.geojson':'application/geo+json','.png':'image/png'})[ext] || 'application/octet-stream'}).end(data);
  });
});
async function run() {
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({headless:true});
  try {
    const context = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    const page = await context.newPage();
    await page.route('**/*', async route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    await page.goto(origin,{waitUntil:'domcontentloaded'});
    await page.locator('.parking_search_control').waitFor();
    await page.locator('.recommendation-sheet details').waitFor();
    assert.equal(await page.locator('#recommend-parking').isDisabled(),true);
    await page.locator('.parking_search_toggle').click();
    await page.getByPlaceholder('Dirección o lugar').fill('Plaza Mayor');
    await page.getByRole('button',{name:'Buscar',exact:true}).first().click();
    await page.getByText(/no está disponible.*mapa/i).waitFor();
    await page.getByRole('button',{name:'Mapa',exact:true}).first().click();
    await page.evaluate(() => map.fire('click',{latlng:L.latLng(40.4,-3.7)}));
    await page.locator('#recommendation-details > summary').click();
    await page.locator('#recommend-parking:not([disabled])').waitFor();
    await page.locator('#recommend-parking').click();
    await page.locator('.recommendation-card').first().waitFor();
    assert.equal(await page.locator('.recommendation-card').count(),2,'without origin, Park & Ride must not be ranked');
    assert.match(await page.locator('#recommendation-results').innerText(),/añade un origen/i);
    assert.match(await page.locator('#recommendation-results').innerText(),/Precio no disponible/);
    assert.match(await page.locator('#recommendation-results').innerText(),/ZBE/);
    await page.locator('#recommendation-details > summary').click();
    await page.locator('.parking_search_toggle').click();
    await page.getByText('Origen opcional').click();
    await page.getByRole('button',{name:'Mapa',exact:true}).nth(1).click();
    await page.evaluate(() => map.fire('click',{latlng:L.latLng(40.4,-3.711)}));
    await page.locator('#recommendation-details > summary').click();
    await page.locator('#recommend-parking').click();
    await page.locator('.recommendation-card').nth(2).waitFor();
    assert.equal(await page.locator('.recommendation-card').count(),3,'should show unique cost, closest and Park & Ride strategies');
    assert.match(await page.locator('#recommendation-results').innerText(),/transporte público/i);
    assert.match(await page.locator('#recommendation-results').innerText(),/estimación: 4,00|4,00/);
    await page.locator('.recommendation-focus').first().click();
    await page.waitForFunction(() => map.getZoom() >= 16,{timeout:3000});
    assert.ok(await page.evaluate(() => map.getZoom() >= 16),'recommendation should focus the map');
    assert.equal(await page.locator('#recommendation-details').evaluate(el => el.open),true);
    await page.screenshot({path:'/tmp/zona-recommendations-mobile.png',fullPage:false});
    await context.close();
    console.log('Mobile destination fallback, duration ranking, origin-gated Park & Ride, cost/ZBE explanations and map focus: PASS');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
run().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
