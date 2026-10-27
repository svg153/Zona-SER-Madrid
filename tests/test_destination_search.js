"use strict";

const assert = require("assert");
const Search = require("../web/destination-search.js");

(function testPointNormalization() {
    assert.deepStrictEqual(
        Search.normalizePoint({lat: "40.4", lng: "-3.7", label: "Madrid"}),
        {lat: 40.4, lon: -3.7, label: "Madrid", source: "map"}
    );
    assert.strictEqual(Search.normalizePoint({lat: "x", lon: -3.7}), null);
})();

(function testStateUpdatesAreImmutable() {
    const initial = Search.createState();
    const next = Search.updateState(initial, "destination", {lat: 40.4, lon: -3.7, label: "A"});
    assert.strictEqual(initial.destination, null);
    assert.strictEqual(next.destination.label, "A");
    const cleared = Search.updateState(next, "destination", null);
    assert.strictEqual(cleared.destination, null);
})();

(async function testRateLimitAndCache() {
    let clock = 10000;
    const scheduled = [];
    let calls = 0;
    const geocoder = {
        geocode(query, callback) {
            calls += 1;
            callback([{name: query, center: {lat: 40.4, lng: -3.7}}]);
        }
    };
    const limited = Search.createRateLimitedGeocoder(geocoder, {
        now: () => clock,
        schedule: (fn, delay) => {
            scheduled.push(delay);
            clock += delay;
            fn();
        },
        minIntervalMs: 1100
    });

    const first = await limited.geocode("A");
    const second = await limited.geocode("B");
    const cached = await limited.geocode("A");

    assert.strictEqual(first.length, 1);
    assert.strictEqual(second.length, 1);
    assert.strictEqual(cached.length, 1);
    assert.strictEqual(calls, 2, "repeated query should use cache");
    assert.strictEqual(scheduled[0], 0);
    assert(scheduled[1] >= 1100, "second network query should be rate limited");
})().then(() => console.log("destination search tests passed"));
