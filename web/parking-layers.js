"use strict";

(function () {
    window.parkingDecisionSources = window.parkingDecisionSources || {};

    function parkingIcon(kind) {
        var markerClass = 'municipal_public_parking_marker';
        var markerHtml = '<span class="parking_marker_p">P</span>';

        if (kind === 'municipal_park_ride') {
            markerClass = 'municipal_park_ride_marker';
            markerHtml = '<span class="parking_marker_p">P</span><span class="parking_marker_transfer">↔</span>';
        } else if (kind === 'regional_park_ride') {
            markerClass = 'regional_park_ride_marker';
            markerHtml = '<span class="parking_marker_p">P</span><span class="parking_marker_transfer">T</span>';
        }

        return L.divIcon({
            className: 'parking_marker ' + markerClass,
            html: markerHtml,
            iconSize: [32, 32],
            iconAnchor: [16, 32],
            popupAnchor: [0, -28]
        });
    }

    function parkingPopup(feature) {
        var props = feature.properties || {};
        var kind = props.kind;
        var fallbackName = 'Aparcamiento público municipal';
        var typeLabel = 'Parking público municipal';

        if (kind === 'municipal_park_ride') {
            fallbackName = 'Aparcamiento disuasorio municipal';
            typeLabel = 'Park & Ride municipal';
        } else if (kind === 'regional_park_ride') {
            fallbackName = 'Aparcamiento Aparca+T';
            typeLabel = 'Aparca+T del CRTM';
        }

        var html = '<strong>' + escape_html(props.name || fallbackName) + '</strong>';
        html += '<br><span>' + typeLabel + '</span>';
        if (props.address) html += '<br><strong>Dirección:</strong> ' + escape_html(props.address);
        if (props.spaces) html += '<br><strong>Plazas:</strong> ' + escape_html(props.spaces);
        if (kind === 'regional_park_ride') {
            html += '<br><strong>Estancia gratuita:</strong> ' + escape_html(props.minHours) + ' a ' + escape_html(props.maxHours) + ' h si se cumplen las condiciones del CRTM';
            html += '<br><strong>Requisito:</strong> realizar al menos un viaje en transporte público y acreditarlo antes de retirar el vehículo.';
            if (props.coordinatesApproximate) html += '<br><small>Marcador aproximado sobre la estación adyacente.</small>';
        } else if (props.description) {
            html += '<br><strong>Información:</strong> ' + escape_html(props.description);
        }
        html += '<hr><small>La disponibilidad, tarifas y condiciones pueden cambiar. Consulta la ficha oficial antes de desplazarte.';
        if (props.sourceUrl) html += ' · <a href="' + escape_html(props.sourceUrl) + '" target="_blank" rel="noopener noreferrer">Fuente oficial</a>';
        if (props.verifiedAt) html += ' · verificado ' + escape_html(props.verifiedAt);
        html += '</small>';
        return html;
    }

    function deduplicateParkingLayers() {
        var ride = overlay_registry['parking:municipal-park-ride'];
        var pub = overlay_registry['parking:public-municipal'];
        if (!ride || !pub) return;
        var positions = {};
        ride.layer.eachLayer(function(marker) { var p = marker.getLatLng(); positions[p.lat + ',' + p.lng] = true; });
        var duplicates = [];
        pub.layer.eachLayer(function(marker) { var p = marker.getLatLng(); if (positions[p.lat + ',' + p.lng]) duplicates.push(marker); });
        duplicates.forEach(function(marker) { pub.layer.removeLayer(marker); });
        if (duplicates.length) window.dispatchEvent(new Event('parking-deduplicated'));
    }

    function loadParkingLayer(config) {
        load_json(config.path, function(response) {
            window.parkingDecisionSources[config.id] = response;
            window.dispatchEvent(new CustomEvent('parking:source-updated', {detail: {source: config.id}}));
            var layer = L.geoJSON(response, {
                pointToLayer: function(feature, latlng) {
                    return L.marker(latlng, {icon: parkingIcon(config.kind), title: (feature.properties && feature.properties.name) || config.label, alt: (feature.properties && feature.properties.name) || config.label});
                },
                onEachFeature: function(feature, marker) {
                    marker.bindPopup(parkingPopup(feature), {maxWidth: 380});
                }
            });
            window.dispatchEvent(new CustomEvent('parking-data', {detail:{config:config, data:response, layer:layer}}));
            register_decision_layer(
                config.group,
                config.id,
                config.label,
                layer,
                config.defaultOn,
                config.order
            );
            deduplicateParkingLayers();

            if (
                config.kind === 'municipal_public_parking' &&
                window.ParkingOccupancy &&
                window.ZONA_SER_CONFIG &&
                window.ZONA_SER_CONFIG.parkingOccupancyEndpoint
            ) {
                window.ParkingOccupancy.enrichLayer(layer, {
                    endpoint: window.ZONA_SER_CONFIG.parkingOccupancyEndpoint,
                    onUpdate: function(marker, status) {
                        marker.setPopupContent(
                            parkingPopup(marker.feature) +
                            window.ParkingOccupancy.renderStatus(status)
                        );
                    }
                }).then(function(diagnostics) {
                    window.parkingOccupancyDiagnostics = diagnostics;
                });
            }
        }, function(status) {
            window.dispatchEvent(new CustomEvent('parking-error', {detail:{id:config.id,label:config.label,status:status}}));
            console.warn(config.label + ' layer unavailable. HTTP status:', status);
        });
    }

    loadParkingLayer({
        path: 'disuasorios.geojson',
        kind: 'municipal_park_ride',
        group: 'parkride',
        id: 'parking:municipal-park-ride',
        label: 'Disuasorios municipales',
        defaultOn: true,
        order: 1
    });
    loadParkingLayer({
        path: 'aparcat.geojson',
        kind: 'regional_park_ride',
        group: 'parkride',
        id: 'parking:aparca-t',
        label: 'Aparca+T CRTM',
        defaultOn: true,
        order: 2
    });
    loadParkingLayer({
        path: 'parkings-publicos.geojson',
        kind: 'municipal_public_parking',
        group: 'parking',
        id: 'parking:public-municipal',
        label: 'Públicos municipales',
        defaultOn: true,
        order: 1
    });
})();
