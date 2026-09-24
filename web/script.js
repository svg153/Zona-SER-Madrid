"use strict"

var zonas_ids = [];
var zonas_layerGroup = {};
var basemaps = {};
var ser_rules_data = {rules: {}, source: '', verifiedAt: ''};

function load_json (path, callback, errorCallback) {
    try {
        var xhr0 = new XMLHttpRequest();
        xhr0.open('GET', path);
        xhr0.setRequestHeader('Content-Type', 'application/json');
        xhr0.responseType = 'json';
        xhr0.onload = function() {
            if (xhr0.status === 200) {
                callback(xhr0.response);
                return;
            }
            if (errorCallback) errorCallback(xhr0.status);
        };
        xhr0.onerror = function() {
            if (errorCallback) errorCallback(xhr0.status);
        };
        xhr0.send();
    } catch(error) {
        console.log(error);
        if (errorCallback) errorCallback(0);
    }
}

function escape_html(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function get_ser_rule(color) {
    return ser_rules_data.rules && ser_rules_data.rules[color];
}

function build_parking_popup(feature) {
    var description = feature.properties.description || '';
    var color = feature.properties.Color;
    var rule = get_ser_rule(color);
    if (!rule) return description;

    var html = '<strong>' + escape_html(rule.label) + '</strong>';
    html += '<br>' + escape_html(rule.summary);
    html += '<br><strong>Duración:</strong> ' + escape_html(rule.maxStay);
    html += '<br><strong>Después:</strong> ' + escape_html(rule.cooldown);
    html += '<br><strong>Coste:</strong> ' + escape_html(rule.price);

    if (description) {
        html += '<hr>' + description;
    }

    if (ser_rules_data.source) {
        html += '<hr><small>Reglas verificadas: ' + escape_html(ser_rules_data.verifiedAt || 'sin fecha');
        html += ' · <a href="' + escape_html(ser_rules_data.source) + '" target="_blank" rel="noopener noreferrer">Fuente oficial</a></small>';
    }
    return html;
}

function add_ser_legend() {
    if (!ser_rules_data.rules) return;

    var legend = L.control({position: 'bottomright'});
    legend.onAdd = function() {
        var div = L.DomUtil.create('div', 'ser_legend');
        var order = ['Verde', 'Azul', 'Naranja', 'Rojo', 'Alta Rotación'];
        var html = '<strong>Tipos de plaza SER</strong>';
        order.forEach(function(name) {
            var rule = get_ser_rule(name);
            if (!rule) return;
            html += '<div class="ser_legend_item">';
            html += '<span class="ser_swatch" style="background:' + escape_html(rule.color) + '"></span>';
            html += '<span><strong>' + escape_html(rule.label) + '</strong><br><small>' + escape_html(rule.maxStay) + '</small></span>';
            html += '</div>';
        });
        if (ser_rules_data.source) {
            html += '<div class="ser_legend_source"><a href="' + escape_html(ser_rules_data.source) + '" target="_blank" rel="noopener noreferrer">Fuente oficial</a>';
            if (ser_rules_data.verifiedAt) html += ' · ' + escape_html(ser_rules_data.verifiedAt);
            html += '</div>';
        }
        div.innerHTML = html;
        L.DomEvent.disableClickPropagation(div);
        return div;
    };
    legend.addTo(map);
}

function compute_url() {
    var selected = [];
    var basemapid;
    Object.keys(zonas_layerGroup).forEach(function(id){
        var lay = zonas_layerGroup[id];
        if (map.hasLayer(lay)) {
            selected.push(id);
        }
    });
    Object.keys(basemaps).forEach(function(id){
        var lay = basemaps[id];
        if (map.hasLayer(lay)) {
            basemapid = id;
        }
    });
    var center = map.getCenter().lat.toFixed(6) + "," + map.getCenter().lng.toFixed(6);
    var zoom = map.getZoom();

    update_url(center, zoom, basemapid, selected.join(","));
}

function update_url(center, zoom, basemapid, selected) {
    var url = window.location.href;
    var urlParts = url.split('?');
    if (urlParts.length > 0) {
        var baseUrl = urlParts[0];

        var selected_str = selected ? '&s=' + selected : '';
        var basemapid_str = basemapid ? '&b=' + basemapid : '';
        var updatedQueryString = 'c=' + center + '&z=' + zoom + basemapid_str + selected_str;

        var updatedUri = baseUrl + '?' + updatedQueryString;
        window.history.replaceState({}, document.title, updatedUri);
    }
}

function parse_url() {
    var params = {};
    var search = location.search.substr(1);
    if (search.length === 0) {
        return {};
    }
    var definitions = search.split('&');
    if (definitions.length < 2) {
        search = decodeURIComponent(search);
        definitions = search.split('&');
    }

    definitions.forEach(function (val) {
        var parts = val.split('=', 2);
        var key = decodeURIComponent(parts[0]);
        var value = parts[1];
        params[key] = value;
    });

    return params;
}

var center = [40.4338300, -3.6886756];
var zoom = 14;

var copyr = '<a href="http://javier.jimenezshaw.com" target="_blank">@ Javier Jimenez Shaw</a> | ';

var ign = L.tileLayer(
    '//www.ign.es/wmts/ign-base?layer=IGNBaseTodo&tilematrixset=EPSG:3857&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image/jpeg&TileMatrix={z}&TileCol={x}&TileRow={y}',
    {attribution: copyr + '© IGN.es', maxZoom: 20}
);

var osm = L.tileLayer(
    '//{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    {attribution: copyr + '© OpenStreetMap contributors', maxZoom: 19}
);

var esri_map = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    {attribution: copyr + '© Esri.com', maxZoom: 19}
);

var esri_sat = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {attribution: copyr + '© Esri.com', maxZoom: 21}
);

basemaps = {
    ign: ign,
    osm: osm,
    esri_map: esri_map,
    esri_sat: esri_sat
};

var baseTree = [
    {label: "IGN", layer: ign},
    {label: "OSM", layer: osm},
    {label: "Esri Map", layer: esri_map},
    {label: "Esri Sat", layer: esri_sat},
];

var map = L.map('map', {
    layers: [ign],
    center: center,
    zoom: zoom,
    maxZoom: 21,
});

var layers_in_control = [];
var tree = L.control.layers.tree(baseTree, layers_in_control, {collapsed: false});
tree.addTo(map);
L.control.scale({imperial: false}).addTo(map);
var barrio_text = L.control({position: 'bottomleft'});
barrio_text.onAdd = function(map) {return L.DomUtil.create('div', 'text_barrio')};
barrio_text.onRemove = function(map) {};
barrio_text.addTo(map);

function load_zonas() {
    load_json('zonas.geojson', function(response){
        var jsonLayer = L.geoJSON(response,
            {
                style: {
                    fillColor: 'yellow',
                    color: 'mediumorchid',
                    opacity: 0.8,
                    fillOpacity: 0.08
                },
                onEachFeature: function (feature, layer) {
                    if (feature.properties.name) {
                        var id = feature.properties.zona;
                        zonas_ids.push(id);
                        layer.on('mouseover', function () {
                            barrio_text.getContainer().innerHTML = feature.properties.name;
                        });
                        layer.on('mouseout', function () {
                            barrio_text.getContainer().innerHTML = '';
                        });
                        layer.on('click', function() {
                            if (id in zonas_layerGroup) {
                                var lay = zonas_layerGroup[id];
                                if (map.hasLayer(lay)) {
                                    map.removeLayer(lay);
                                } else {
                                    map.addLayer(lay);
                                }
                            }
                        });
                    }
                },
                filter: function(feature) {
                    return feature.properties.zona != '--';
                }
            });
        jsonLayer.addTo(map);
        download_plazas_json();
    });
}

function download_plazas_json() {
    load_json('objects.geojson', function(response){
        var zonas = {};
        var zonas_parquimetros = {};
        var colors = {'Verde': 'green', 'Azul': 'blue', 'Naranja': 'orange', 'Rojo': 'red', 'Alta Rotación': 'cyan', '(null)': 'grey', undefined: 'black'};
        L.geoJSON(response, {
            style: function (feature) {
                if (feature.properties.style) {
                    return feature.properties.style;
                }
                var rule = get_ser_rule(feature.properties.Color);
                var color = rule ? rule.color : colors[feature.properties.Color];
                return {color: color, "weight": 5};
            },
            pointToLayer: function (feature, latlng) {
                return L.circleMarker(latlng, {"radius": 2, "fillColor": 'black', "color": 'black', "fillOpacity": 0.8});
            },
            onEachFeature: function (feature, layer) {
                var zona = feature.properties.zona;
                if (zona && zona != '--') {
                    zonas[zona] = zonas[zona] || [];
                    zonas[zona].push(layer);
                    if (layer instanceof L.CircleMarker) {
                        zonas_parquimetros[zona] = zonas_parquimetros[zona] || [];
                        zonas_parquimetros[zona].push(layer);
                    }
                }
                var popup = build_parking_popup(feature);
                if (popup) {
                    layer.bindPopup(popup, {maxWidth: 360});
                }
            }
        });

        Object.keys(zonas).sort().forEach(function(zona) {
            var layers = zonas[zona];
            zonas_layerGroup[zona] = L.layerGroup(layers);
            layers_in_control.push({label: "Zona " + zona, id: Number(zona), layer: zonas_layerGroup[zona]});
        });

        layers_in_control.sort(function(a,b) { return a.id - b.id; });
        tree.remove();
        tree = L.control.layers.tree(baseTree, layers_in_control, {collapsed: true});
        tree.addTo(map);
        map.on('moveend zoomend overlayadd overlayremove baselayerchange', function() {
            compute_url();
        });
        map.on('zoomend overlayadd', function() {
            var currentZoom = map.getZoom();
            if(currentZoom >= 16) {
                Object.keys(zonas_parquimetros).sort().forEach(function(zona) {
                    if (map.hasLayer(zonas_layerGroup[zona])) {
                        var layers = zonas_parquimetros[zona];
                        layers.forEach(function(layer) { map.addLayer(layer); });
                    }
                });
            } else {
                Object.keys(zonas_parquimetros).sort().forEach(function(zona) {
                    var layers = zonas_parquimetros[zona];
                    layers.forEach(function(layer) { map.removeLayer(layer); });
                });
            }
        });
        var params = parse_url();
        console.log("Zonas Loaded " + layers_in_control.length);
        if (params['b'] && params['b'] in basemaps) {
            map.addLayer(basemaps[params['b']]);
        }
        if (params['z'] && params['c']) {
            map.flyTo(params['c'].split(','), parseInt(params['z']));
        }
        if (params['s']) {
            params['s'].split(',').forEach(function(id) {
                if (id in zonas_layerGroup) {
                    map.addLayer(zonas_layerGroup[id]);
                }
            });
        }
    });
}

load_json('ser-rules.json', function(response) {
    ser_rules_data = response || ser_rules_data;
    add_ser_legend();
    load_zonas();
}, function(status) {
    console.warn('SER rules catalog unavailable, continuing without semantic metadata. HTTP status:', status);
    load_zonas();
});
