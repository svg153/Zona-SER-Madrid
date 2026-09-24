"use strict";

(function () {
    function municipalParkingIcon() {
        return L.divIcon({
            className: 'parking_marker municipal_park_ride_marker',
            html: '<span class="parking_marker_p">P</span><span class="parking_marker_transfer">↔</span>',
            iconSize: [32, 32],
            iconAnchor: [16, 32],
            popupAnchor: [0, -28]
        });
    }

    function parkingPopup(feature) {
        var props = feature.properties || {};
        var html = '<strong>' + escape_html(props.name || 'Aparcamiento disuasorio municipal') + '</strong>';
        html += '<br><span>Park & Ride municipal</span>';
        if (props.address) {
            html += '<br><strong>Dirección:</strong> ' + escape_html(props.address);
        }
        if (props.description) {
            html += '<br><strong>Información:</strong> ' + escape_html(props.description);
        }
        html += '<hr><small>La disponibilidad y las condiciones pueden cambiar. Consulta la ficha oficial antes de desplazarte.';
        if (props.sourceUrl) {
            html += ' · <a href="' + escape_html(props.sourceUrl) + '" target="_blank" rel="noopener noreferrer">Fuente oficial</a>';
        }
        html += '</small>';
        return html;
    }

    load_json('disuasorios.geojson', function (response) {
        var layer = L.geoJSON(response, {
            pointToLayer: function (feature, latlng) {
                return L.marker(latlng, {icon: municipalParkingIcon()});
            },
            onEachFeature: function (feature, marker) {
                marker.bindPopup(parkingPopup(feature), {maxWidth: 360});
            }
        });

        layer.addTo(map);
        L.control.layers(null, {
            '🅿 Disuasorios municipales': layer
        }, {
            collapsed: true,
            position: 'topright'
        }).addTo(map);
    }, function (status) {
        console.warn('Municipal park-and-ride layer unavailable. HTTP status:', status);
    });
})();
