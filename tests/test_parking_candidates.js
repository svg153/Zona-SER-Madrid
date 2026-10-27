"use strict";

const assert = require("assert");
const Candidates = require("../web/parking-candidates.js");

const lineFeature = (color, coords, id) => ({
    type: "Feature",
    geometry: {type: "LineString", coordinates: coords},
    properties: {Color: color, OBJECTID: id}
});

(function testSpatialIndexPrunesFarFeatures() {
    const collection = {
        type: "FeatureCollection",
        features: [
            lineFeature("Naranja", [[-3.70, 40.40], [-3.699, 40.401]], 1),
            lineFeature("Naranja", [[-3.90, 40.60], [-3.899, 40.601]], 2)
        ]
    };
    const index = Candidates.buildSerIndex(collection);
    const nearby = Candidates.nearbySerFeatures(index, {lat: 40.4005, lon: -3.7001}, 2);
    assert.strictEqual(nearby.length, 1);
    assert.strictEqual(nearby[0].properties.OBJECTID, 1);
})();

(function testSerCandidateUsesStructuredRuleAndNearestPoint() {
    const collection = {
        type: "FeatureCollection",
        features: [lineFeature("Naranja", [[-3.70, 40.40], [-3.699, 40.401]], 7)]
    };
    const index = Candidates.buildSerIndex(collection);
    const fakeTurf = {
        point(coords) { return {type: "Feature", geometry: {type: "Point", coordinates: coords}}; },
        nearestPointOnLine() {
            return {type: "Feature", geometry: {type: "Point", coordinates: [-3.6995, 40.4005]}, properties: {dist: 0.25}};
        }
    };
    const rules = {rules: {Naranja: {label: "Larga estancia", maxHours: 12, costPerHour: 0.5, maxBillableHours: 12}}};
    const candidates = Candidates.serCandidates(index, {lat: 40.4, lon: -3.7}, 8, rules, fakeTurf);
    assert.strictEqual(candidates.length, 1);
    assert.strictEqual(candidates[0].type, "ser_long_stay");
    assert.strictEqual(candidates[0].costPerHour, 0.5);
    assert.strictEqual(candidates[0].distanceToDestinationKm, 0.25);
})();

(function testIncompatibleSerDurationIsDroppedBeforeGeometryWork() {
    let turfCalls = 0;
    const collection = {
        type: "FeatureCollection",
        features: [lineFeature("Azul", [[-3.70, 40.40], [-3.699, 40.401]], 8)]
    };
    const index = Candidates.buildSerIndex(collection);
    const fakeTurf = {
        point() { turfCalls += 1; return {}; },
        nearestPointOnLine() { return {}; }
    };
    const rules = {rules: {Azul: {label: "Azul", maxHours: 4}}};
    const candidates = Candidates.serCandidates(index, {lat: 40.4, lon: -3.7}, 8, rules, fakeTurf);
    assert.strictEqual(candidates.length, 0);
    assert.strictEqual(turfCalls, 0);
})();

(function testPointLayersBecomeCandidatesWithoutInventingPrice() {
    const collection = {
        type: "FeatureCollection",
        features: [{
            type: "Feature",
            geometry: {type: "Point", coordinates: [-3.7, 40.4]},
            properties: {kind: "municipal_public_parking", name: "Parking A"}
        }]
    };
    const candidates = Candidates.pointCandidates(collection, {prefix: "public", type: "public_parking"});
    assert.strictEqual(candidates.length, 1);
    assert.strictEqual(candidates[0].costKnown, false);
    assert.strictEqual(candidates[0].fixedCost, null);
})();

console.log("parking candidate adapter tests passed");
