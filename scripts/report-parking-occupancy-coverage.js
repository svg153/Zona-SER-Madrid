"use strict";

const fs = require("fs");
const path = require("path");
const Occupancy = require("../web/parking-occupancy.js");

const DEFAULT_ENDPOINT = "https://zona-ser-occupancy.vercel.app/api/parking-occupancy";

function percent(part, total) {
    return total ? Math.round((part / total) * 1000) / 10 : 0;
}

function summarizeCoverage(features, payload) {
    const records = payload && Array.isArray(payload.parkings) ? payload.parkings : [];
    const result = Occupancy.matchRecords(features || [], records);
    const withOccupancy = result.assignments.filter(function (assignment) {
        const value = assignment.record && assignment.record.freeSpaces;
        return value !== null && value !== undefined && Number.isFinite(Number(value));
    }).length;
    const matched = result.assignments.length;

    return {
        fetchedAt: payload && payload.fetchedAt || null,
        staticFeatures: (features || []).length,
        dynamicRecords: records.length,
        matchedRecords: matched,
        unmatchedDynamicRecords: result.unmatchedRecords.length,
        unmatchedStaticFeatures: (features || []).length - matched,
        matchedWithOccupancy: withOccupancy,
        matchedWithoutOccupancy: matched - withOccupancy,
        staticFeatureCoveragePercent: percent(matched, (features || []).length),
        dynamicRecordCoveragePercent: percent(matched, records.length)
    };
}

async function main() {
    if (typeof globalThis.fetch !== "function") {
        throw new Error("This command requires a Node.js version with global fetch");
    }

    const endpoint = process.env.PARKING_OCCUPANCY_ENDPOINT || DEFAULT_ENDPOINT;
    const file = path.join(__dirname, "..", "web", "parkings-publicos.geojson");
    const collection = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!collection || !Array.isArray(collection.features)) {
        throw new Error("web/parkings-publicos.geojson has no features array");
    }

    const payload = await Occupancy.fetchOccupancy(endpoint, globalThis.fetch.bind(globalThis));
    const report = summarizeCoverage(collection.features, payload);
    report.endpoint = endpoint;
    report.source = payload.source || null;
    console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) {
    main().catch(function (error) {
        console.error("Parking occupancy coverage report failed:", error.message);
        process.exitCode = 1;
    });
}

module.exports = {summarizeCoverage};
