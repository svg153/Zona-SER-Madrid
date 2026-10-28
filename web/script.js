"use strict"

var zonas_ids = [];
var zonas_layerGroup = {};
var basemaps = {};
var ser_rules_data = {rules: {}, source: '', verifiedAt: ''};
var ser_feature_layers = [];
var ser_display_layer;
var ser_load_state = {};
var ser_render_generation = 0;
var SER_FILES = {'ser:type:orange':'orange', 'ser:type:blue':'blue', 'ser:type:green':'green', 'ser:type:red':'red', 'ser:type:high-rotation':'high-rotation', 'ser:type:meters':'meters'};
var layer_tree;
var overlay_registry = {};

var initial_params = LayerState.parse(window.location.search);
var initial_layer_ids = LayerState.parseIds(initial_params.l);
var initial_legacy_zones = LayerState.parseIds(initial_params.s);
var has_explicit_layer_state = Object.prototype.hasOwnProperty.call(initial_params, 'l') || Object.prototype.hasOwnProperty.call(initial_params, 's');

var OVERLAY_GROUPS = {
    ser: {label: 'Aparcamiento SER', order: 10, selectAllCheckbox: true},
    parkride: {label: 'Park & Ride', order: 20, selectAllCheckbox: true},
    parking: {label: 'Parkings', order: 30, selectAllCheckbox: true},
    restrictions: {label: 'Restricciones', order: 40, selectAllCheckbox: true},
    barrios: {label: 'Barrios SER (filtro avanzado)', order: 50, selectAllCheckbox: false}
};

var SER_TYPE_IDS = {
    'Naranja': 'ser:type:orange',
    'Azul': 'ser:type:blue',
    'Verde': 'ser:type:green',
    'Rojo': 'ser:type:red',
    'Alta Rotación': 'ser:type:high-rotation'
};

function load_json(path, callback, errorCallback) {
    try {
        var xhr0 = new XMLHttpRequest();
        xhr0.open('GET', path);
        xhr0.setRequestHeader('Content-Type', 'application/json');
        xhr0.responseType = 'json';
        xhr0.timeout = 30000;
        xhr0.ontimeout = function() { if (errorCallback) errorCallback(0); };
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

    if (description) html += '<hr>' + description;
    if (ser_rules_data.source) {
        html += '<hr><small>Reglas verificadas: ' + escape_html(ser_rules_data.verifiedAt || 'sin fecha');
        html += ' · <a href="' + escape_html(ser_rules_data.source) + '" target="_blank" rel="noopener noreferrer">Fuente oficial</a></small>';
    }
    return html;
}

function add_ser_legend() {
    if (!ser_rules_data.rules) return;
    var legend = L.control({position: 'topright'});
    legend.onAdd = function() {
        var div = L.DomUtil.create('div', 'ser_legend');
        var order = ['Verde', 'Azul', 'Naranja', 'Rojo', 'Alta Rotación'];
        var collapsedByDefault = true;
        var html = '<button type="button" class="ser_legend_toggle" aria-expanded="' + (!collapsedByDefault) + '" aria-label="Mostrar u ocultar la leyenda de tipos de plaza SER">';
        html += '<span>Tipos de plaza SER</span><span class="ser_legend_chevron" aria-hidden="true">▾</span></button>';
        html += '<div class="ser_legend_body">';
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
        html += '<div class="ser_legend_source"><b>P↔</b> Disuasorio municipal<br><b>PT</b> Aparca+T CRTM<br><b>P</b> Parking público municipal</div>';
        html += '</div>';
        div.innerHTML = html;

        if (collapsedByDefault) L.DomUtil.addClass(div, 'is-collapsed');

        var toggle = div.querySelector('.ser_legend_toggle');
        L.DomEvent.on(toggle, 'click', function(event) {
            L.DomEvent.stop(event);
            var isCollapsed = div.classList.toggle('is-collapsed');
            toggle.setAttribute('aria-expanded', String(!isCollapsed));
        });

        L.DomEvent.disableClickPropagation(div);
        L.DomEvent.disableScrollPropagation(div);
        return div;
    };
    legend.addTo(map);
}

function build_overlay_tree() {
    var grouped = {};
    Object.keys(overlay_registry).forEach(function(id) {
        var item = overlay_registry[id];
        grouped[item.group] = grouped[item.group] || [];
        grouped[item.group].push(item);
    });

    return Object.keys(grouped)
        .sort(function(a, b) { return OVERLAY_GROUPS[a].order - OVERLAY_GROUPS[b].order; })
        .map(function(groupId) {
            var config = OVERLAY_GROUPS[groupId];
            var node = {
                label: config.label,
                children: grouped[groupId]
                    .sort(function(a, b) { return (a.order || 0) - (b.order || 0) || a.label.localeCompare(b.label); })
                    .map(function(item) { return {label: item.label, layer: item.layer}; })
            };
            if (config.selectAllCheckbox) node.selectAllCheckbox = true;
            return node;
        });
}

function rebuild_layer_tree() {
    if (layer_tree) layer_tree.remove();
    layer_tree = L.control.layers.tree(baseTree, build_overlay_tree(), {collapsed: true});
    layer_tree.addTo(map);
}

function should_select_initially(id, defaultOn) {
    if (!has_explicit_layer_state) return !!defaultOn;
    if (initial_layer_ids.indexOf(id) !== -1) return true;
    if (id.indexOf('ser:zone:') === 0) {
        return initial_legacy_zones.indexOf(id.substring('ser:zone:'.length)) !== -1;
    }
    return false;
}

function register_decision_layer(group, id, label, layer, defaultOn, order, deferTree) {
    overlay_registry[id] = {
        group: group,
        id: id,
        label: label,
        layer: layer,
        order: order || 0
    };
    if (should_select_initially(id, defaultOn) && !map.hasLayer(layer)) {
        map.addLayer(layer);
    }
    if (!deferTree) rebuild_layer_tree();
    refresh_ser_display();
    request_ser_for_selection();
    window.dispatchEvent(new Event('overlay-registered'));
    return layer;
}

function selected_overlay_ids() {
    return Object.keys(overlay_registry).filter(function(id) {
        return map.hasLayer(overlay_registry[id].layer);
    }).sort();
}

function compute_url() {
    var basemapid;
    Object.keys(basemaps).forEach(function(id) {
        if (map.hasLayer(basemaps[id])) basemapid = id;
    });
    var center = map.getCenter().lat.toFixed(6) + ',' + map.getCenter().lng.toFixed(6);
    var query = LayerState.build(center, map.getZoom(), basemapid, selected_overlay_ids());
    window.history.replaceState({}, document.title, window.location.href.split('?')[0] + '?' + query);
}

function selected_ser_types() {
    var ids = {};
    Object.keys(SER_TYPE_IDS).forEach(function(color) {
        var id = SER_TYPE_IDS[color];
        if (overlay_registry[id] && map.hasLayer(overlay_registry[id].layer)) ids[id] = true;
    });
    if (overlay_registry['ser:type:meters'] && map.hasLayer(overlay_registry['ser:type:meters'].layer)) {
        ids['ser:type:meters'] = true;
    }
    return ids;
}

function selected_ser_zones() {
    var ids = {};
    Object.keys(zonas_layerGroup).forEach(function(zone) {
        if (map.hasLayer(zonas_layerGroup[zone])) ids[zone] = true;
    });
    return ids;
}

function refresh_ser_display() {
    if (!ser_display_layer) return;
    var generation = ++ser_render_generation;
    ser_display_layer.clearLayers();
    var types = selected_ser_types();
    var zones = selected_ser_zones();
    var typeKeys = Object.keys(types), zoneKeys = Object.keys(zones);
    if (!typeKeys.length && !zoneKeys.length) return;
    var index = 0;
    function renderBatch() {
        if (generation !== ser_render_generation) return;
        var end = Math.min(index + 300, ser_feature_layers.length);
        for (; index < end; index++) {
            var item = ser_feature_layers[index];
            if ((!typeKeys.length || types[item.typeId]) && (!zoneKeys.length || (item.zone && zones[item.zone]))) ser_display_layer.addLayer(item.layer);
        }
        if (index < ser_feature_layers.length) setTimeout(renderBatch, 0);
    }
    renderBatch();
}

function request_ser_for_selection(retry) {
    var types = selected_ser_types();
    var zones = selected_ser_zones();
    var ids = Object.keys(types);
    if (Object.keys(zones).length && !ids.length) ids = Object.keys(SER_FILES).concat(['gray', 'other']);
    ids.forEach(function(id) { load_ser_part(SER_FILES[id] || id, retry === true); });
}

var serDecisionSourceRequests = {};
window.ensureSerDecisionSource = function(durationHours) {
    var hours = Number(durationHours);
    if (!Number.isFinite(hours) || hours <= 0) return Promise.reject(new Error('Indica una duración válida.'));
    var colorByFile = {green:'Verde', blue:'Azul', orange:'Naranja', red:'Rojo', 'high-rotation':'Alta Rotación'};
    var names = Object.keys(colorByFile).filter(function(file) {
        var rule = get_ser_rule(colorByFile[file]);
        return rule && Number(rule.maxHours) >= hours;
    });
    var request = function(name) {
        if (!serDecisionSourceRequests[name]) {
            serDecisionSourceRequests[name] = new Promise(function(resolve, reject) {
                load_json('ser-data/' + name + '.geojson', function(data) {
                    if (!data || !Array.isArray(data.features)) reject(new Error('Capa SER inválida: ' + name));
                    else resolve(data.features);
                }, function(status) {
                    delete serDecisionSourceRequests[name];
                    reject(new Error('No se pudo cargar la capa SER ' + name + ' (' + status + ').'));
                });
            });
        }
        return serDecisionSourceRequests[name];
    };
    return Promise.all(names.map(request)).then(function(groups) {
        var features = [].concat.apply([], groups);
        window.serParkingSource = {type:'FeatureCollection', features:features};
        window.dispatchEvent(new CustomEvent('parking:source-updated', {detail:{source:'ser', durationHours:hours}}));
        return window.serParkingSource;
    });
};

function load_ser_part(name, retry) {
    if (ser_load_state[name] === 'loading' || ser_load_state[name] === 'ready' || (ser_load_state[name] === 'error' && !retry)) return;
    ser_load_state[name] = 'loading';
    window.dispatchEvent(new CustomEvent('ser-load-status', {detail:{name:name, status:'loading'}}));
    load_json('ser-data/' + name + '.geojson', function(response) {
        if (!response || !Array.isArray(response.features)) { failed(); return; }
        var features = response.features, index = 0;
        function processBatch() {
            var end = Math.min(index + 250, features.length);
            L.geoJSON({type:'FeatureCollection', features:features.slice(index, end)}, {
                renderer: ser_canvas,
                style: function(feature) {
                    if (feature.properties.style) return feature.properties.style;
                    var rule = get_ser_rule(feature.properties.Color);
                    return {color: rule ? rule.color : 'grey', weight:5};
                },
                pointToLayer: function(feature, latlng) { return L.circleMarker(latlng, {renderer:ser_canvas, radius:2, fillColor:'black', color:'black', fillOpacity:0.8}); },
                onEachFeature: function(feature, layer) {
                    var props = feature.properties || {};
                    var typeId = SER_TYPE_IDS[props.Color] || (layer instanceof L.CircleMarker ? 'ser:type:meters' : null);
                    var zone = props.zona && props.zona != '--' ? String(props.zona) : null;
                    ser_feature_layers.push({layer:layer, zone:zone, typeId:typeId});
                    var popup = build_parking_popup(feature);
                    if (popup) layer.bindPopup(popup, {maxWidth:360});
                    var types = selected_ser_types(), zones = selected_ser_zones();
                    if ((Object.keys(types).length || Object.keys(zones).length) && (!Object.keys(types).length || types[typeId]) && (!Object.keys(zones).length || (zone && zones[zone]))) ser_display_layer.addLayer(layer);
                }
            });
            index = end;
            if (index < features.length) setTimeout(processBatch, 0);
            else {
                ser_load_state[name] = 'ready';
                window.dispatchEvent(new CustomEvent('ser-load-status', {detail:{name:name, status:'ready'}}));
            }
        }
        processBatch();
    }, failed);
    function failed() {
        ser_load_state[name] = 'error';
        window.dispatchEvent(new CustomEvent('ser-load-status', {detail:{name:name, status:'error'}}));
    }
}

var center = [40.4338300, -3.6886756];
var zoom = 14;
if (initial_params.c) {
    var parsedCenter = initial_params.c.split(',').map(Number);
    if (parsedCenter.length === 2 && parsedCenter.every(Number.isFinite)) center = parsedCenter;
}
if (initial_params.z && Number.isFinite(Number(initial_params.z))) zoom = Number(initial_params.z);

var copyr = '<a href="http://javier.jimenezshaw.com" target="_blank">@ Javier Jimenez Shaw</a> | ';
var ign = L.tileLayer('//www.ign.es/wmts/ign-base?layer=IGNBaseTodo&tilematrixset=EPSG:3857&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image/jpeg&TileMatrix={z}&TileCol={x}&TileRow={y}', {attribution: copyr + '© IGN.es', maxZoom: 20});
var osm = L.tileLayer('//{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {attribution: copyr + '© OpenStreetMap contributors', maxZoom: 19});
var esri_map = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {attribution: copyr + '© Esri.com', maxZoom: 19});
var esri_sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {attribution: copyr + '© Esri.com', maxZoom: 21});

basemaps = {ign: ign, osm: osm, esri_map: esri_map, esri_sat: esri_sat};
var baseTree = [
    {label: 'IGN', layer: ign},
    {label: 'OSM', layer: osm},
    {label: 'Esri Map', layer: esri_map},
    {label: 'Esri Sat', layer: esri_sat}
];

var initialBasemap = basemaps[initial_params.b] || ign;
var map = L.map('map', {layers: [initialBasemap], center: center, zoom: zoom, maxZoom: 21, preferCanvas:true});
var ser_canvas = L.canvas({padding:0.3});
ser_display_layer = L.layerGroup().addTo(map);
rebuild_layer_tree();
L.control.scale({imperial: false}).addTo(map);

var barrio_text = L.control({position: 'bottomleft'});
barrio_text.onAdd = function() { return L.DomUtil.create('div', 'text_barrio'); };
barrio_text.onRemove = function() {};
barrio_text.addTo(map);

map.on('moveend zoomend baselayerchange', compute_url);
map.on('overlayadd overlayremove', function() {
    refresh_ser_display();
    request_ser_for_selection();
    compute_url();
});

function register_ser_type_controls() {
    var order = ['Naranja', 'Azul', 'Verde', 'Rojo', 'Alta Rotación'];
    order.forEach(function(color, index) {
        var rule = get_ser_rule(color) || {label: color};
        register_decision_layer('ser', SER_TYPE_IDS[color], rule.label, L.layerGroup(), color === 'Naranja', index + 1, true);
    });
    register_decision_layer('ser', 'ser:type:meters', 'Parquímetros', L.layerGroup(), false, 99, true);
    rebuild_layer_tree();
}

function load_zonas() {
    load_json('zonas.geojson', function(response) {
        var jsonLayer = L.geoJSON(response, {
            style: {fillColor: 'yellow', color: 'mediumorchid', opacity: 0.4, weight: 1, fillOpacity: 0.02},
            onEachFeature: function(feature, layer) {
                if (!feature.properties.name) return;
                var zone = String(feature.properties.zona);
                zonas_ids.push(zone);
                var controller = L.layerGroup();
                zonas_layerGroup[zone] = controller;
                register_decision_layer('barrios', 'ser:zone:' + zone, feature.properties.name, controller, false, Number(zone), true);

                layer.on('mouseover', function() { barrio_text.getContainer().innerHTML = feature.properties.name; });
                layer.on('mouseout', function() { barrio_text.getContainer().innerHTML = ''; });
                layer.on('click', function() {
                    if (window.destination_selection_active) return;
                    if (map.hasLayer(controller)) map.removeLayer(controller);
                    else map.addLayer(controller);
                });
            },
            filter: function(feature) { return feature.properties.zona != '--'; }
        });
        jsonLayer.addTo(map);
        rebuild_layer_tree();
        request_ser_for_selection();
    });
}

load_json('ser-rules.json', function(response) {
    ser_rules_data = response || ser_rules_data;
    add_ser_legend();
    register_ser_type_controls();
    load_zonas();
}, function(status) {
    console.warn('SER rules catalog unavailable, continuing without semantic metadata. HTTP status:', status);
    register_ser_type_controls();
    load_zonas();
});
