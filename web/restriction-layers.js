"use strict";

(function () {
    var restrictionsControl = L.control.layers(null, {}, {
        collapsed: true,
        position: 'topright'
    }).addTo(map);

    function restrictionPopup(label, sourceUrl) {
        var html = '<strong>' + escape_html(label) + '</strong>';
        html += '<br>Ámbito geográfico oficial de restricción.';
        html += '<hr><small>Esta capa no determina si un vehículo concreto puede acceder. Consulta la normativa vigente y las excepciones aplicables.';
        html += ' · <a href="' + escape_html(sourceUrl) + '" target="_blank" rel="noopener noreferrer">Fuente oficial</a></small>';
        return html;
    }

    function loadRestriction(config) {
        load_json(config.path, function (response) {
            var layer = L.geoJSON(response, {
                style: {
                    color: config.color,
                    weight: config.weight || 2,
                    dashArray: config.dashArray || null,
                    fillOpacity: config.fillOpacity || 0.02
                },
                onEachFeature: function (feature, polygon) {
                    polygon.bindPopup(restrictionPopup(config.label, config.sourceUrl), {maxWidth: 360});
                }
            });
            restrictionsControl.addOverlay(layer, config.label);
        }, function (status) {
            console.warn(config.label + ' layer unavailable. HTTP status:', status);
        });
    }

    loadRestriction({
        path: 'zbe-madrid.geojson',
        label: 'Madrid ZBE',
        color: '#555',
        dashArray: '7 5',
        fillOpacity: 0.01,
        sourceUrl: 'https://sigma.madrid.es/hosted/rest/services/GEOPORTAL/SERVICIO_DE_ESTACIONAMIENTO_REGULADO/MapServer/62'
    });
    loadRestriction({
        path: 'zbedep-centro.geojson',
        label: 'ZBEDEP Distrito Centro',
        color: '#7b1fa2',
        weight: 3,
        fillOpacity: 0.025,
        sourceUrl: 'https://sigma.madrid.es/hosted/rest/services/GEOPORTAL/SERVICIO_DE_ESTACIONAMIENTO_REGULADO/MapServer/61'
    });
    loadRestriction({
        path: 'zbedep-plaza-eliptica.geojson',
        label: 'ZBEDEP Plaza Elíptica',
        color: '#b71c1c',
        weight: 3,
        fillOpacity: 0.025,
        sourceUrl: 'https://sigma.madrid.es/hosted/rest/services/GEOPORTAL/SERVICIO_DE_ESTACIONAMIENTO_REGULADO/MapServer/60'
    });
})();
