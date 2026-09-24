"use strict";

(function () {
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

    function loadParkingLayer(config) {
        load_json(config.path, function(response) {
            var layer = L.geoJSON(response, {
                pointToLayer: function(feature, latlng) {
                    return L.marker(latlng, {icon: parkingIcon(config.kind)});
                },
                onEachFeature: function(feature, marker) {
                    marker.bindPopup(parkingPopup(feature), {maxWidth: 380});
                }
            });
            register_decision_layer(
                config.group,
                config.id,
                config.label,
                layer,
                config.defaultOn,
                config.order
            );
        }, function(status) {
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
        defaultOn: false,
        order: 2
    });
    loadParkingLayer({
        path: 'parkings-publicos.geojson',
        kind: 'municipal_public_parking',
        group: 'parking',
        id: 'parking:public-municipal',
        label: 'Públicos municipales',
        defaultOn: false,
        order: 1
    });
})();
