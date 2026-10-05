"use strict";

const assert = require("assert");
const Api = require("../api/parking-occupancy.js");

(function testRestNormalization() {
    const rows = Api.normalizeRestPayload([{
        id: 7,
        name: "Parking Test",
        address: "Calle Test 1",
        latitude: "40.4001",
        longitude: "-3.7002",
        occupations: [{free: 42, moment: "2026-10-06T01:00:00+02:00"}]
    }]);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].id, "7");
    assert.strictEqual(rows[0].freeSpaces, 42);
    assert.strictEqual(rows[0].lat, 40.4001);
    assert(rows[0].measuredAt.startsWith("2026-10-05T23:00:00"));
})();

(function testRestWithoutOccupation() {
    const rows = Api.normalizeRestPayload([{id: 8, name: "No data", latitude: "40.4", longitude: "-3.7"}]);
    assert.strictEqual(rows[0].freeSpaces, null);
    assert.strictEqual(rows[0].measuredAt, null);
})();

(function testSoapNormalization() {
    const xml = [
      '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">',
      '<s:Body><GetListParkingResponse>',
      '<a:lstParking xmlns:a="http://schemas.datacontract.org/2004/07/InfoParking">',
      '<a:id>5</a:id><a:name>Nuestra &amp; Señora</a:name><a:address>Calle Hiedra</a:address>',
      '<a:latitude>40.472181</a:latitude><a:longitude>-3.679160</a:longitude>',
      '<a:lstOccupation><a:occupation><a:free>431</a:free><a:moment>2026-10-06T01:00:00+02:00</a:moment></a:occupation></a:lstOccupation>',
      '</a:lstParking></GetListParkingResponse></s:Body></s:Envelope>'
    ].join("");
    const rows = Api.parseSoapPayload(xml);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].name, "Nuestra & Señora");
    assert.strictEqual(rows[0].freeSpaces, 431);
})();

(async function testRestFallsBackToSoap() {
    let calls = 0;
    const soap = '<a:lstParking><a:id>9</a:id><a:name>Fallback</a:name><a:latitude>40.4</a:latitude><a:longitude>-3.7</a:longitude></a:lstParking>';
    const fetchImpl = async (url) => {
        calls += 1;
        if (String(url).includes("restInfoParking")) return {ok: false, status: 500};
        return {ok: true, status: 200, text: async () => soap};
    };
    const result = await Api.fetchParkingOccupancy(fetchImpl, 1000);
    assert.strictEqual(result.transport, "soap");
    assert.strictEqual(result.parkings[0].id, "9");
    assert.strictEqual(calls, 2);
})().then(() => console.log("parking occupancy api tests passed"));
