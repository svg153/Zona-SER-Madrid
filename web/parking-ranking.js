"use strict";

(function (root, factory) {
    var api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    else root.ParkingRanking = api;
})(typeof self !== "undefined" ? self : this, function () {
    function radians(value) {
        return value * Math.PI / 180;
    }

    function distanceKm(a, b) {
        if (!a || !b) return null;
        var lat1 = Number(a.lat);
        var lon1 = Number(a.lon);
        var lat2 = Number(b.lat);
        var lon2 = Number(b.lon);
        if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;

        var earthKm = 6371.0088;
        var dLat = radians(lat2 - lat1);
        var dLon = radians(lon2 - lon1);
        var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(radians(lat1)) * Math.cos(radians(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return earthKm * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
    }

    function numericValue(value) {
        if (value === null || value === undefined || value === "") return null;
        var number = Number(value);
        return Number.isFinite(number) ? number : null;
    }

    function supportsDuration(candidate, durationHours) {
        if (!candidate || !Number.isFinite(durationHours) || durationHours <= 0) return false;
        var minHours = numericValue(candidate.minHours);
        var maxHours = numericValue(candidate.maxHours);
        if (minHours !== null && durationHours < minHours) return false;
        if (maxHours !== null && durationHours > maxHours) return false;
        return true;
    }

    function estimateCost(candidate, durationHours) {
        if (!candidate || !Number.isFinite(durationHours) || durationHours <= 0) return null;
        var fixedCost = numericValue(candidate.fixedCost);
        if (fixedCost !== null) return fixedCost;

        var costPerHour = numericValue(candidate.costPerHour);
        if (costPerHour !== null) {
            var billableHours = durationHours;
            var maxBillableHours = numericValue(candidate.maxBillableHours);
            if (maxBillableHours !== null) billableHours = Math.min(billableHours, maxBillableHours);
            return costPerHour * billableHours;
        }
        return null;
    }

    function prepareCandidate(candidate, destination, durationHours, origin) {
        var result = Object.assign({}, candidate);
        result.supported = supportsDuration(candidate, durationHours);
        result.distanceToDestinationKm = Number.isFinite(Number(candidate.distanceToDestinationKm))
            ? Number(candidate.distanceToDestinationKm)
            : distanceKm(destination, candidate);
        result.distanceFromOriginKm = origin ? distanceKm(origin, candidate) : null;
        result.estimatedCost = result.supported ? estimateCost(candidate, durationHours) : null;
        result.rankableParkRide = candidate.type !== "park_ride" || !!origin;
        return result;
    }

    function firstBy(items, comparator) {
        if (!items.length) return null;
        return items.slice().sort(comparator)[0];
    }

    function uniqueRecommendations(recommendations) {
        var seen = {};
        return recommendations.filter(function (entry) {
            if (!entry || !entry.candidate || seen[entry.candidate.id]) return false;
            seen[entry.candidate.id] = true;
            return true;
        });
    }

    function recommend(options) {
        options = options || {};
        var destination = options.destination;
        var origin = options.origin || null;
        var durationHours = Number(options.durationHours);
        var candidates = Array.isArray(options.candidates) ? options.candidates : [];

        if (!destination || !Number.isFinite(durationHours) || durationHours <= 0) {
            return {recommendations: [], excluded: candidates, needsOriginForParkRide: false};
        }

        var prepared = candidates.map(function (candidate) {
            return prepareCandidate(candidate, destination, durationHours, origin);
        });
        var legal = prepared.filter(function (candidate) { return candidate.supported; });
        var excluded = prepared.filter(function (candidate) { return !candidate.supported; });

        var nearDestination = legal.filter(function (candidate) {
            return candidate.type !== "park_ride" && Number.isFinite(candidate.distanceToDestinationKm);
        });
        var knownCost = nearDestination.filter(function (candidate) {
            return Number.isFinite(candidate.estimatedCost);
        });

        var cheapest = firstBy(knownCost, function (a, b) {
            return a.estimatedCost - b.estimatedCost ||
                a.distanceToDestinationKm - b.distanceToDestinationKm;
        });
        var closest = firstBy(nearDestination, function (a, b) {
            return a.distanceToDestinationKm - b.distanceToDestinationKm;
        });

        var parkRide = null;
        var parkRideCandidates = legal.filter(function (candidate) {
            return candidate.type === "park_ride" && Number.isFinite(candidate.distanceFromOriginKm);
        });
        if (origin) {
            parkRide = firstBy(parkRideCandidates, function (a, b) {
                return a.distanceFromOriginKm - b.distanceFromOriginKm ||
                    a.distanceToDestinationKm - b.distanceToDestinationKm;
            });
        }

        var recommendations = uniqueRecommendations([
            cheapest && {
                reason: "cheapest_known",
                explanation: "Es la alternativa legal con menor coste calculable para la duración indicada.",
                candidate: cheapest
            },
            closest && {
                reason: "closest",
                explanation: "Es la alternativa legal conocida más próxima al destino.",
                candidate: closest
            },
            parkRide && {
                reason: "park_ride_from_origin",
                explanation: "Es el Park & Ride conocido mejor alineado por proximidad al origen indicado; la ruta real en transporte debe verificarse.",
                candidate: parkRide
            }
        ]);

        return {
            recommendations: recommendations,
            excluded: excluded,
            needsOriginForParkRide: !origin && legal.some(function (candidate) { return candidate.type === "park_ride"; })
        };
    }

    return {
        distanceKm: distanceKm,
        supportsDuration: supportsDuration,
        estimateCost: estimateCost,
        recommend: recommend
    };
});
