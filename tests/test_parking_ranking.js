"use strict";

const assert = require("assert");
const Ranking = require("../web/parking-ranking.js");

(function testDistance() {
    const km = Ranking.distanceKm(
        {lat: 40.4168, lon: -3.7038},
        {lat: 40.4066, lon: -3.6892}
    );
    assert(km > 1 && km < 2.5, "Madrid distance should be plausible");
})();

(function testDurationHardFilter() {
    assert.strictEqual(Ranking.supportsDuration({maxHours: 4}, 5), false);
    assert.strictEqual(Ranking.supportsDuration({maxHours: 12}, 8), true);
    assert.strictEqual(Ranking.supportsDuration({}, 8), true);
})();

(function testKnownCost() {
    assert.strictEqual(Ranking.estimateCost({costPerHour: 0.5}, 8), 4);
    assert.strictEqual(Ranking.estimateCost({fixedCost: 12}, 8), 12);
    assert.strictEqual(Ranking.estimateCost({}, 8), null);
})();

(function testRecommendationsAreExplainableAndDoNotFakeParkRide() {
    const destination = {lat: 40.3929, lon: -3.6975};
    const candidates = [
        {id: "orange", type: "ser_long_stay", lat: 40.401, lon: -3.705, maxHours: 12, costPerHour: 0.5},
        {id: "garage", type: "public_parking", lat: 40.3935, lon: -3.697, maxHours: null},
        {id: "parkride", type: "park_ride", lat: 40.411, lon: -3.735, maxHours: 16, fixedCost: 0}
    ];

    const withoutOrigin = Ranking.recommend({destination, durationHours: 8, candidates});
    assert.strictEqual(withoutOrigin.needsOriginForParkRide, true);
    assert(withoutOrigin.recommendations.some(x => x.reason === "cheapest_known"));
    assert(withoutOrigin.recommendations.some(x => x.reason === "closest"));
    assert(!withoutOrigin.recommendations.some(x => x.reason === "park_ride_from_origin"));

    const withOrigin = Ranking.recommend({
        destination,
        origin: {lat: 40.350, lon: -3.540},
        durationHours: 8,
        candidates
    });
    assert(withOrigin.recommendations.some(x => x.reason === "park_ride_from_origin"));
})();

(function testIllegalCandidatesAreExcluded() {
    const result = Ranking.recommend({
        destination: {lat: 40.4, lon: -3.7},
        durationHours: 6,
        candidates: [
            {id: "blue", type: "ser_blue", lat: 40.401, lon: -3.701, maxHours: 4, costPerHour: 1},
            {id: "orange", type: "ser_long_stay", lat: 40.402, lon: -3.702, maxHours: 12, costPerHour: 0.5}
        ]
    });
    assert.deepStrictEqual(result.excluded.map(x => x.id), ["blue"]);
    assert(result.recommendations.every(x => x.candidate.id !== "blue"));
})();

console.log("parking ranking prototype tests passed");
