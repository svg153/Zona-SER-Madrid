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
        if (props.address) {
            html += '<br><strong>Dirección:</strong> ' + escape_html(props.address);
        }
        if (props.spaces) {
            html += '<br><strong>Plazas:</strong> ' + escape_html(props.spaces);
        }
        if (kind === 'regional_park_ride') {
            html += '<br><strong>Estancia gratuita:</strong> ' + escape_html(props.minHours) + ' a ' + escape_html(props.maxHours) + ' h si se cumplen las condiciones del CRTM';
            html += '<br><strong>Requisito:</strong> realizar al menos un viaje en transporte público y acreditarlo antes de retirar el vehículo.';
            if (props.coordinatesApproximate) {
                html += '<br><small>Marcador aproximado sobre la estación adyacente.</small>';
            }
        } else if (props.description) {
            html += '<br><strong>Información:</strong> ' + escape_html(props.description);
        }
        html += '<hr><small>La disponibilidad, tarifas y condiciones pueden cambiar. Consulta la ficha oficial antes de desplazarte.';
        if (props.sourceUrl) {
            html += ' · <a href="' + escape_html(props.sourceUrl) + '" target="_blank" rel="noopener noreferrer">Fuente oficial</a>';
        }
        if (props.verifiedAt) {
            html += ' · verificado ' + escape_html(props.verifiedAt);
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
                    marker.bindPopup(parkingPopup(feature), {maxWidth: 380});
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
    loadParkingLayer('aparcat.geojson', 'regional_park_ride', 'P+T Aparca+T CRTM', false);
    loadParkingLayer('parkings-publicos.geojson', 'municipal_public_parking', 'P Parkings públicos municipales', false);
})();
