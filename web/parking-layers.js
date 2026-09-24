"use strict";

(function () {
    function parkingIcon(kind) {
        var isParkRide = kind === 'municipal_park_ride';
        return L.divIcon({
            className: 'parking_marker ' + (isParkRide ? 'municipal_park_ride_marker' : 'municipal_public_parking_marker'),
            html: isParkRide
                ? '<span class="parking_marker_p">P</span><span class="parking_marker_transfer">↔</span>'
                : '<span class="parking_marker_p">P</span>',
            iconSize: [32, 32],
            iconAnchor: [16, 32],
            popupAnchor: [0, -28]
        });
    }

    function parkingPopup(feature) {
        var props = feature.properties || {};
        var isParkRide = props.kind === 'municipal_park_ride';
        var fallbackName = isParkRide ? 'Aparcamiento disuasorio municipal' : 'Aparcamiento público municipal';
        var typeLabel = isParkRide ? 'Park & Ride municipal' : 'Parking público municipal';
        var html = '<strong>' + escape_html(props.name || fallbackName) + '</strong>';
        html += '<br><span>' + typeLabel + '</span>';
        if (props.address) {
            html += '<br><strong>Dirección:</strong> ' + escape_html(props.address);
        }
        if (props.description) {
            html += '<br><strong>Información:</strong> ' + escape_html(props.description);
        }
        html += '<hr><small>La disponibilidad, tarifas y condiciones pueden cambiar. Consulta la ficha oficial antes de desplazarte.';
        if (props.sourceUrl) {
            html += ' · <a href="' + escape_html(props.sourceUrl) + '" target="_blank" rel="noopener noreferrer">Fuente oficial</a>';
        }
        html += '</small>';
        return html;
    }

    function loadParkingLayer(path, kind, label, addByDefault) {
        load_json(path, function (response) {
            var layer = L.geoJSON(response, {
                pointToLayer: function (feature, latlng) {
                    return L.marker(latlng, {icon: parkingIcon(kind)});
                },
                onEachFeature: function (feature, marker) {
                    marker.bindPopup(parkingPopup(feature), {maxWidth: 360});
                }
            });

            if (addByDefault) {
                layer.addTo(map);
            }
            var overlays = {};
            overlays[label] = layer;
            L.control.layers(null, overlays, {
                collapsed: true,
                position: 'topright'
            }).addTo(map);
        }, function (status) {
            console.warn(label + ' layer unavailable. HTTP status:', status);
        });
    }

    loadParkingLayer('disuasorios.geojson', 'municipal_park_ride', '🅿 Disuasorios municipales', true);
    loadParkingLayer('parkings-publicos.geojson', 'municipal_public_parking', 'P Parkings públicos municipales', false);
})();
