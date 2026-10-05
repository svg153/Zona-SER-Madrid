"use strict";

const assert = require("assert");
global.escape_html = (value) => String(value);
const Occupancy = require("../web/parking-occupancy.js");

const feature = (name, address, lon, lat) => ({
    type: "Feature",
    geometry: {type: "Point", coordinates: [lon, lat]},
    properties: {name, address}
});

(function testClassification() {
    const now = new Date("2026-10-06T10:00:00Z").getTime();
    assert.strictEqual(Occupancy.classify({freeSpaces: 5, measuredAt: "2026-10-06T09:59:00Z"}, now).state, "available");
    assert.strictEqual(Occupancy.classify({freeSpaces: 0, measuredAt: "2026-10-06T09:59:00Z"}, now).state, "full");
    assert.strictEqual(Occupancy.classify({freeSpaces: 5, measuredAt: "2026-10-06T09:40:00Z"}, now).state, "stale");
    assert.strictEqual(Occupancy.classify({freeSpaces: null}, now).state, "no_data");
    assert.strictEqual(Occupancy.classify({error: true}, now).state, "unavailable");
})();

(function testReliableMatching() {
    const features = [
        feature("Aparcamiento Plaza Mayor", "Calle A, 1", -3.7038, 40.4168),
        feature("Aparcamiento Retiro", "Calle B, 2", -3.6885, 40.4152)
    ];
    const records = [{
        id: "1",
        name: "Parking Plaza Mayor",
        address: "Calle A 1",
        lon: -3.70381,
        lat: 40.41681
    }];
    const result = Occupancy.matchRecords(features, records);
    assert.strictEqual(result.assignments.length, 1);
    assert.strictEqual(result.unmatchedRecords.length, 0);
    assert.strictEqual(result.assignments[0].feature.properties.name, "Aparcamiento Plaza Mayor");
})();

(function testAmbiguousMatchingStaysUnmatched() {
    const features = [
        feature("Parking Centro Norte", "Calle A", -3.7000, 40.4000),
        feature("Parking Centro Sur", "Calle A", -3.7002, 40.4000)
    ];
    const records = [{
        id: "2",
        name: "Parking Centro",
        address: "Calle A",
        lon: -3.7001,
        lat: 40.4000
    }];
    const result = Occupancy.matchRecords(features, records);
    assert.strictEqual(result.assignments.length, 0);
    assert.strictEqual(result.unmatchedRecords.length, 1);
})();

(function testFarRecordDoesNotMatch() {
    const result = Occupancy.matchRecords(
        [feature("Parking A", "Calle A", -3.70, 40.40)],
        [{id: "3", name: "Parking A", address: "Calle A", lon: -3.80, lat: 40.50}]
    );
    assert.strictEqual(result.assignments.length, 0);
})();

console.log("parking occupancy client tests passed");
