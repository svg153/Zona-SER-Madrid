"use strict";

(function (root, factory) {
    var api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    else root.ParkingOccupancy = api;
})(typeof self !== "undefined" ? self : this, function () {
    var STALE_AFTER_MS = 5 * 60 * 1000;

    function normalizeText(value) {
        return String(value || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, " ")
            .trim();
    }

    function tokens(value) {
        var normalized = normalizeText(value);
        return normalized ? normalized.split(/\s+/).filter(function (token) { return token.length > 2; }) : [];
    }

    function tokenSimilarity(a, b) {
        var left = tokens(a);
        var right = tokens(b);
        if (!left.length || !right.length) return 0;
        var rightSet = {};
        right.forEach(function (token) { rightSet[token] = true; });
        var common = left.filter(function (token) { return rightSet[token]; }).length;
        var union = {};
        left.concat(right).forEach(function (token) { union[token] = true; });
        return common / Object.keys(union).length;
    }

    function radians(value) {
        return value * Math.PI / 180;
    }

    function distanceMeters(a, b) {
        if (!a || !b) return Infinity;
        var lat1 = Number(a.lat);
        var lon1 = Number(a.lon);
        var lat2 = Number(b.lat);
        var lon2 = Number(b.lon);
        if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return Infinity;
        var earth = 6371008.8;
        var dLat = radians(lat2 - lat1);
        var dLon = radians(lon2 - lon1);
        var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(radians(lat1)) * Math.cos(radians(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return earth * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    }

    function featureIdentity(feature) {
        var props = feature && feature.properties || {};
        var coordinates = feature && feature.geometry && feature.geometry.coordinates || [];
        return {
            name: props.name || "",
            address: props.address || "",
            lat: Number(coordinates[1]),
            lon: Number(coordinates[0])
        };
    }

    function recordIdentity(record) {
        return {
            name: record && record.name || "",
            address: record && record.address || "",
            lat: Number(record && record.lat),
            lon: Number(record && record.lon)
        };
    }

    function matchScore(feature, record) {
        var staticIdentity = featureIdentity(feature);
        var dynamicIdentity = recordIdentity(record);
        var distance = distanceMeters(staticIdentity, dynamicIdentity);
        if (!Number.isFinite(distance) || distance > 250) return null;

        var nameScore = tokenSimilarity(staticIdentity.name, dynamicIdentity.name);
        var addressScore = tokenSimilarity(staticIdentity.address, dynamicIdentity.address);
        var textScore = Math.max(nameScore, addressScore, (nameScore + addressScore) / 2);

        if (distance > 75 && textScore < 0.25) return null;
        if (distance <= 75 && textScore < 0.08) return null;

        var proximity = Math.max(0, 1 - distance / 250);
        return {
            score: proximity * 0.55 + textScore * 0.45,
            distanceMeters: distance,
            textScore: textScore
        };
    }

    function matchRecords(features, records) {
        var assignments = [];
        var usedFeatures = {};
        var unmatchedRecords = [];

        (records || []).forEach(function (record) {
            var candidates = [];
            (features || []).forEach(function (feature, featureIndex) {
                if (usedFeatures[featureIndex]) return;
                var result = matchScore(feature, record);
                if (result) candidates.push({feature: feature, featureIndex: featureIndex, result: result});
            });
            candidates.sort(function (a, b) { return b.result.score - a.result.score; });

            if (!candidates.length) {
                unmatchedRecords.push(record);
                return;
            }

            var best = candidates[0];
            var second = candidates[1];
            if (second && best.result.score - second.result.score < 0.12) {
                unmatchedRecords.push(record);
                return;
            }

            usedFeatures[best.featureIndex] = true;
            assignments.push({
                feature: best.feature,
                record: record,
                distanceMeters: best.result.distanceMeters,
                confidence: best.result.score
            });
        });

        return {assignments: assignments, unmatchedRecords: unmatchedRecords};
    }

    function classify(record, nowMs, staleAfterMs) {
        staleAfterMs = Number.isFinite(staleAfterMs) ? staleAfterMs : STALE_AFTER_MS;
        if (!record) return {state: "no_data"};
        if (record.error) return {state: "unavailable"};

        var free = Number(record.freeSpaces);
        if (record.freeSpaces === null || record.freeSpaces === undefined || !Number.isFinite(free)) {
            return {state: "no_data", measuredAt: record.measuredAt || null};
        }

        var measured = record.measuredAt ? new Date(record.measuredAt).getTime() : NaN;
        var now = Number.isFinite(nowMs) ? nowMs : Date.now();
        if (!Number.isFinite(measured) || now - measured > staleAfterMs) {
            return {state: "stale", freeSpaces: free, measuredAt: record.measuredAt || null};
        }

        return {
            state: free === 0 ? "full" : "available",
            freeSpaces: free,
            measuredAt: record.measuredAt || null
        };
    }

    function stateLabel(state) {
        var labels = {
            available: "Plazas libres",
            full: "Completo",
            stale: "Dato antiguo",
            no_data: "Sin dato de ocupación",
            unmatched: "Sin correspondencia fiable",
            unavailable: "Ocupación no disponible"
        };
        return labels[state] || "Ocupación desconocida";
    }

    function renderStatus(status) {
        status = status || {state: "no_data"};
        var html = '<div class="parking_occupancy parking_occupancy_' + escape_html(status.state || "no_data") + '">';
        html += '<strong>Ocupación:</strong> ' + escape_html(stateLabel(status.state));
        if (Number.isFinite(status.freeSpaces)) html += ' · ' + escape_html(status.freeSpaces) + ' libres';
        if (status.measuredAt) {
            var date = new Date(status.measuredAt);
            html += '<br><small>Medición: ' + escape_html(Number.isNaN(date.getTime()) ? status.measuredAt : date.toLocaleString()) + '</small>';
        }
        html += '</div>';
        return html;
    }

    async function fetchOccupancy(endpoint, fetchImpl) {
        if (!endpoint) return null;
        fetchImpl = fetchImpl || window.fetch.bind(window);
        var response = await fetchImpl(endpoint, {headers: {"Accept": "application/json"}});
        if (!response.ok) throw new Error("occupancy endpoint returned HTTP " + response.status);
        var payload = await response.json();
        if (!payload || !Array.isArray(payload.parkings)) throw new Error("invalid occupancy response");
        return payload;
    }

    function enrichLayer(layer, options) {
        options = options || {};
        var endpoint = options.endpoint;
        if (!endpoint || !layer) return Promise.resolve({state: "disabled"});

        var markers = [];
        layer.eachLayer(function (marker) {
            if (marker.feature && marker.feature.geometry && marker.feature.geometry.type === "Point") markers.push(marker);
        });
        var features = markers.map(function (marker) { return marker.feature; });

        return fetchOccupancy(endpoint, options.fetchImpl)
            .then(function (payload) {
                var matched = matchRecords(features, payload.parkings);
                var recordByFeature = new Map();
                matched.assignments.forEach(function (assignment) {
                    recordByFeature.set(assignment.feature, assignment.record);
                });

                markers.forEach(function (marker) {
                    var record = recordByFeature.get(marker.feature);
                    var status = classify(record, Date.now(), options.staleAfterMs);
                    if (options.onUpdate) options.onUpdate(marker, status, record);
                });

                if (matched.unmatchedRecords.length) {
                    console.info("Parking occupancy records left unmatched:", matched.unmatchedRecords.length);
                }
                return {
                    state: "available",
                    matched: matched.assignments.length,
                    unmatched: matched.unmatchedRecords.length,
                    fetchedAt: payload.fetchedAt || null
                };
            })
            .catch(function (error) {
                markers.forEach(function (marker) {
                    if (options.onUpdate) options.onUpdate(marker, {state: "unavailable"}, null);
                });
                console.warn("Parking occupancy unavailable:", error);
                return {state: "unavailable", error: error};
            });
    }

    return {
        STALE_AFTER_MS: STALE_AFTER_MS,
        normalizeText: normalizeText,
        tokenSimilarity: tokenSimilarity,
        distanceMeters: distanceMeters,
        matchScore: matchScore,
        matchRecords: matchRecords,
        classify: classify,
        stateLabel: stateLabel,
        renderStatus: renderStatus,
        fetchOccupancy: fetchOccupancy,
        enrichLayer: enrichLayer
    };
});
