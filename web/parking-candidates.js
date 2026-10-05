"use strict";

(function (root, factory) {
    var api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    else root.ParkingCandidates = api;
})(typeof self !== "undefined" ? self : this, function () {
    var DEFAULT_CELL_DEGREES = 0.01;
    var DEFAULT_SER_RADIUS_KM = 2.5;

    var SER_TYPES = {
        "Verde": "ser_green",
        "Azul": "ser_blue",
        "Naranja": "ser_long_stay",
        "Rojo": "ser_hospital",
        "Alta Rotación": "ser_high_rotation"
    };

    function coordinatesEach(value, callback) {
        if (!Array.isArray(value)) return;
        if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
            callback(value);
            return;
        }
        value.forEach(function (child) { coordinatesEach(child, callback); });
    }

    function featureBounds(feature) {
        var geometry = feature && feature.geometry;
        if (!geometry || !geometry.coordinates) return null;
        var west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
        coordinatesEach(geometry.coordinates, function (coord) {
            west = Math.min(west, coord[0]);
            east = Math.max(east, coord[0]);
            south = Math.min(south, coord[1]);
            north = Math.max(north, coord[1]);
        });
        return Number.isFinite(west) ? {west: west, south: south, east: east, north: north} : null;
    }

    function cellKey(latIndex, lonIndex) {
        return latIndex + ":" + lonIndex;
    }

    function cellRange(bounds, cellDegrees) {
        return {
            minLat: Math.floor(bounds.south / cellDegrees),
            maxLat: Math.floor(bounds.north / cellDegrees),
            minLon: Math.floor(bounds.west / cellDegrees),
            maxLon: Math.floor(bounds.east / cellDegrees)
        };
    }

    function buildSerIndex(featureCollection, options) {
        options = options || {};
        var cellDegrees = options.cellDegrees || DEFAULT_CELL_DEGREES;
        var cells = {};
        var features = featureCollection && Array.isArray(featureCollection.features)
            ? featureCollection.features
            : [];

        features.forEach(function (feature, index) {
            var color = feature.properties && feature.properties.Color;
            if (!SER_TYPES[color]) return;
            var bounds = featureBounds(feature);
            if (!bounds) return;
            var range = cellRange(bounds, cellDegrees);
            for (var lat = range.minLat; lat <= range.maxLat; lat += 1) {
                for (var lon = range.minLon; lon <= range.maxLon; lon += 1) {
                    var key = cellKey(lat, lon);
                    cells[key] = cells[key] || [];
                    cells[key].push({index: index, feature: feature});
                }
            }
        });

        return {cellDegrees: cellDegrees, cells: cells};
    }

    function nearbySerFeatures(index, point, radiusKm) {
        if (!index || !point) return [];
        radiusKm = Number.isFinite(radiusKm) ? radiusKm : DEFAULT_SER_RADIUS_KM;
        var latDelta = radiusKm / 110.574;
        var lonScale = Math.max(0.2, Math.cos(Number(point.lat) * Math.PI / 180));
        var lonDelta = radiusKm / (111.320 * lonScale);
        var bounds = {
            west: Number(point.lon) - lonDelta,
            east: Number(point.lon) + lonDelta,
            south: Number(point.lat) - latDelta,
            north: Number(point.lat) + latDelta
        };
        var range = cellRange(bounds, index.cellDegrees);
        var seen = {};
        var result = [];

        for (var lat = range.minLat; lat <= range.maxLat; lat += 1) {
            for (var lon = range.minLon; lon <= range.maxLon; lon += 1) {
                (index.cells[cellKey(lat, lon)] || []).forEach(function (item) {
                    if (seen[item.index]) return;
                    seen[item.index] = true;
                    result.push(item.feature);
                });
            }
        }
        return result;
    }

    function ruleForFeature(feature, rulesData) {
        var color = feature && feature.properties && feature.properties.Color;
        return rulesData && rulesData.rules && rulesData.rules[color] || null;
    }

    function nearestOnSer(feature, destination, turfApi) {
        if (!turfApi || !turfApi.nearestPointOnLine || !turfApi.point) return null;
        try {
            var point = turfApi.point([Number(destination.lon), Number(destination.lat)]);
            var nearest = turfApi.nearestPointOnLine(feature, point, {units: "kilometers"});
            if (!nearest || !nearest.geometry || !nearest.geometry.coordinates) return null;
            return {
                lon: nearest.geometry.coordinates[0],
                lat: nearest.geometry.coordinates[1],
                distanceKm: Number(nearest.properties && nearest.properties.dist)
            };
        } catch (error) {
            return null;
        }
    }

    function serFeatureId(feature, fallbackIndex) {
        var props = feature && feature.properties || {};
        var value = props.OBJECTID || props.objectid || props.id || props.ID || fallbackIndex;
        return "ser:" + String(value);
    }

    function serCandidates(index, destination, durationHours, rulesData, turfApi, options) {
        options = options || {};
        var radiusKm = options.radiusKm || DEFAULT_SER_RADIUS_KM;
        return nearbySerFeatures(index, destination, radiusKm)
            .map(function (feature, featureIndex) {
                var color = feature.properties && feature.properties.Color;
                var rule = ruleForFeature(feature, rulesData);
                if (!rule) return null;
                if (Number.isFinite(Number(rule.maxHours)) && Number(durationHours) > Number(rule.maxHours)) return null;
                if (Number.isFinite(Number(rule.minHours)) && Number(durationHours) < Number(rule.minHours)) return null;

                var nearest = nearestOnSer(feature, destination, turfApi);
                if (!nearest || !Number.isFinite(nearest.distanceKm) || nearest.distanceKm > radiusKm) return null;

                return {
                    id: serFeatureId(feature, featureIndex),
                    type: SER_TYPES[color],
                    label: rule.label || color,
                    lat: nearest.lat,
                    lon: nearest.lon,
                    distanceToDestinationKm: nearest.distanceKm,
                    maxHours: Number.isFinite(Number(rule.maxHours)) ? Number(rule.maxHours) : null,
                    minHours: Number.isFinite(Number(rule.minHours)) ? Number(rule.minHours) : null,
                    costPerHour: Number.isFinite(Number(rule.costPerHour)) ? Number(rule.costPerHour) : null,
                    maxBillableHours: Number.isFinite(Number(rule.maxBillableHours)) ? Number(rule.maxBillableHours) : null,
                    costKnown: Number.isFinite(Number(rule.costPerHour)),
                    sourceFeature: feature
                };
            })
            .filter(Boolean)
            .sort(function (a, b) { return a.distanceToDestinationKm - b.distanceToDestinationKm; })
            .slice(0, options.limit || 30);
    }

    function parkingFeatureCandidate(feature, options) {
        options = options || {};
        if (!feature || !feature.geometry || feature.geometry.type !== "Point") return null;
        var coordinates = feature.geometry.coordinates || [];
        var props = feature.properties || {};
        var lon = Number(coordinates[0]);
        var lat = Number(coordinates[1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

        var type = options.type || (props.kind === "municipal_public_parking" ? "public_parking" : "park_ride");
        var minHours = props.minHours === null || props.minHours === undefined || props.minHours === "" ? null : Number(props.minHours);
        var maxHours = props.maxHours === null || props.maxHours === undefined || props.maxHours === "" ? null : Number(props.maxHours);
        var explicitFixedCost = props.fixedCost === null || props.fixedCost === undefined || props.fixedCost === "" ? null : Number(props.fixedCost);
        var eligibleFree = props.freeWhenEligible === true ? 0 : null;
        var fixedCost = Number.isFinite(explicitFixedCost) ? explicitFixedCost : eligibleFree;
        return {
            id: options.prefix + ":" + String(props.id || props.name || options.index || ""),
            type: type,
            label: props.name || options.fallbackLabel || "Aparcamiento",
            address: props.address || "",
            lat: lat,
            lon: lon,
            minHours: Number.isFinite(minHours) ? minHours : null,
            maxHours: Number.isFinite(maxHours) ? maxHours : null,
            fixedCost: fixedCost,
            costKnown: fixedCost !== null,
            freeWhenEligible: props.freeWhenEligible === true,
            requiresPublicTransportTrip: props.freeWhenEligible === true,
            sourceFeature: feature,
            sourceKind: props.kind || ""
        };
    }

    function pointCandidates(featureCollection, options) {
        options = options || {};
        var features = featureCollection && Array.isArray(featureCollection.features)
            ? featureCollection.features
            : [];
        return features.map(function (feature, index) {
            return parkingFeatureCandidate(feature, Object.assign({}, options, {index: index}));
        }).filter(Boolean);
    }

    function buildAllCandidates(options) {
        options = options || {};
        var result = [];
        if (options.serIndex && options.destination && options.rulesData) {
            result = result.concat(serCandidates(
                options.serIndex,
                options.destination,
                options.durationHours,
                options.rulesData,
                options.turfApi,
                options.serOptions
            ));
        }
        result = result.concat(pointCandidates(options.publicParking, {
            prefix: "public",
            type: "public_parking",
            fallbackLabel: "Parking público municipal"
        }));
        result = result.concat(pointCandidates(options.municipalParkRide, {
            prefix: "parkride-madrid",
            type: "park_ride",
            fallbackLabel: "Disuasorio municipal"
        }));
        result = result.concat(pointCandidates(options.aparcaT, {
            prefix: "aparcat",
            type: "park_ride",
            fallbackLabel: "Aparca+T"
        }));
        return result;
    }

    function browserSources() {
        return {
            ser: window.serParkingSource || null,
            publicParking: window.parkingDecisionSources && window.parkingDecisionSources["parking:public-municipal"] || null,
            municipalParkRide: window.parkingDecisionSources && window.parkingDecisionSources["parking:municipal-park-ride"] || null,
            aparcaT: window.parkingDecisionSources && window.parkingDecisionSources["parking:aparca-t"] || null
        };
    }

    var cachedBrowserSerSource = null;
    var cachedBrowserSerIndex = null;

    function browserCandidates(destination, durationHours) {
        var sources = browserSources();
        if (sources.ser !== cachedBrowserSerSource) {
            cachedBrowserSerSource = sources.ser;
            cachedBrowserSerIndex = buildSerIndex(sources.ser);
        }
        return buildAllCandidates({
            serIndex: cachedBrowserSerIndex,
            destination: destination,
            durationHours: durationHours,
            rulesData: window.ser_rules_data,
            turfApi: window.turf,
            publicParking: sources.publicParking,
            municipalParkRide: sources.municipalParkRide,
            aparcaT: sources.aparcaT
        });
    }

    return {
        DEFAULT_CELL_DEGREES: DEFAULT_CELL_DEGREES,
        DEFAULT_SER_RADIUS_KM: DEFAULT_SER_RADIUS_KM,
        SER_TYPES: SER_TYPES,
        featureBounds: featureBounds,
        buildSerIndex: buildSerIndex,
        nearbySerFeatures: nearbySerFeatures,
        nearestOnSer: nearestOnSer,
        serCandidates: serCandidates,
        parkingFeatureCandidate: parkingFeatureCandidate,
        pointCandidates: pointCandidates,
        buildAllCandidates: buildAllCandidates,
        browserCandidates: browserCandidates
    };
});
