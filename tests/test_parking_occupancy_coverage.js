"use strict";

const assert = require("assert");
const Coverage = require("../scripts/report-parking-occupancy-coverage.js");

const feature = (name, address, lon, lat) => ({
    type: "Feature",
    geometry: {type: "Point", coordinates: [lon, lat]},
    properties: {name, address}
});

const features = [
    feature("Aparcamiento Plaza Mayor", "Calle A, 1", -3.7038, 40.4168),
    feature("Aparcamiento Retiro", "Calle B, 2", -3.6885, 40.4152)
];
const payload = {
    fetchedAt: "2026-10-28T10:00:00.000Z",
    parkings: [
        {name: "Parking Plaza Mayor", address: "Calle A 1", lon: -3.70381, lat: 40.41681, freeSpaces: 12},
        {name: "Parking Retiro", address: "Calle B 2", lon: -3.68851, lat: 40.41521, freeSpaces: null},
        {name: "Remote parking", address: "Another place", lon: -3.8, lat: 40.5, freeSpaces: 4}
    ]
};

const report = Coverage.summarizeCoverage(features, payload);
assert.deepStrictEqual(report, {
    fetchedAt: "2026-10-28T10:00:00.000Z",
    staticFeatures: 2,
    dynamicRecords: 3,
    matchedRecords: 2,
    unmatchedDynamicRecords: 1,
    unmatchedStaticFeatures: 0,
    matchedWithOccupancy: 1,
    matchedWithoutOccupancy: 1,
    staticFeatureCoveragePercent: 100,
    dynamicRecordCoveragePercent: 66.7
});

console.log("parking occupancy coverage report tests passed");
