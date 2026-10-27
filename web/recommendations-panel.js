'use strict';
(function() {
    var destination = null;
    var origin = null;
    var highlighted = null;
    var pending = false;
    var sourceStates = {};
    var requiredSources = ['parking:municipal-park-ride','parking:aparca-t','parking:public-municipal'];
    var control = null;
    var $ = function(id) { return document.getElementById(id); };

    function escape(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function(ch) {
            return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
        });
    }
    function distanceText(km) {
        if (!Number.isFinite(km)) return 'Distancia no disponible';
        return km < 1 ? Math.round(km * 1000) + ' m' : km.toFixed(1) + ' km';
    }
    function kindText(candidate) {
        if (candidate.type === 'ser_long_stay') return 'SER naranja · larga estancia';
        if (candidate.type === 'ser_green') return 'SER verde';
        if (candidate.type === 'ser_blue') return 'SER azul';
        if (candidate.type === 'ser_hospital') return 'SER hospitalario';
        if (candidate.type === 'ser_high_rotation') return 'SER alta rotación';
        if (candidate.type === 'public_parking') return 'Parking público municipal';
        if (candidate.sourceKind === 'regional_park_ride') return 'Aparca+T CRTM';
        return 'Disuasorio municipal';
    }
    function pointInRing(point, ring) {
        var inside = false;
        for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            var a = ring[i], b = ring[j];
            if (((a[1] > point.lat) !== (b[1] > point.lat)) &&
                point.lon < (b[0] - a[0]) * (point.lat - a[1]) / ((b[1] - a[1]) || 1e-12) + a[0]) inside = !inside;
        }
        return inside;
    }
    function inPolygon(point, polygon) {
        if (!polygon.length || !pointInRing(point, polygon[0])) return false;
        for (var i = 1; i < polygon.length; i++) if (pointInRing(point, polygon[i])) return false;
        return true;
    }
    function inRestriction(point, geometry) {
        if (!geometry) return false;
        if (geometry.type === 'Polygon') return inPolygon(point, geometry.coordinates);
        if (geometry.type === 'MultiPolygon') return geometry.coordinates.some(function(poly) { return inPolygon(point, poly); });
        return false;
    }
    function restrictionWarnings(candidate) {
        var warnings = [];
        var sources = window.parkingRestrictionSources || {};
        Object.keys(sources).forEach(function(id) {
            var collection = sources[id];
            var hit = collection && collection.features && collection.features.some(function(feature) {
                return inRestriction(candidate, feature.geometry);
            });
            if (!hit) return;
            warnings.push(id === 'restriction:zbe-madrid' ? 'Dentro de Madrid ZBE' :
                id === 'restriction:zbedep-centro' ? 'Dentro de ZBEDEP Distrito Centro' : 'Dentro de ZBEDEP Plaza Elíptica');
        });
        return warnings;
    }
    function costText(candidate) {
        if (!Number.isFinite(candidate.estimatedCost)) return 'Precio no disponible';
        return 'Estimación: ' + new Intl.NumberFormat('es-ES', {style:'currency', currency:'EUR', maximumFractionDigits:2}).format(candidate.estimatedCost);
    }
    function durationText(candidate) {
        var requested = Number($('parking-duration').value);
        var limits = [];
        if (candidate.minHours != null) limits.push('desde ' + candidate.minHours + ' h');
        if (candidate.maxHours != null) limits.push('máx. ' + candidate.maxHours + ' h');
        return requested + ' h · compatible' + (limits.length ? ' (' + limits.join(', ') + ')' : '');
    }
    function reasonText(reason) {
        if (reason === 'cheapest_known') return ['Menor coste conocido', 'Entre las alternativas con una tarifa calculable para esta duración.'];
        if (reason === 'closest') return ['Más cerca del destino', 'La alternativa compatible más próxima en línea recta.'];
        if (reason === 'park_ride_from_origin') return ['Park & Ride desde el origen', 'Más próximo al origen indicado; comprueba el trayecto en transporte público.'];
        return ['Otra opción compatible', 'Alternativa única que también cumple la duración indicada.'];
    }
    function setStatus(message) {
        var status = $('recommendation-status');
        if (status) status.textContent = message;
    }
    function showEmpty(message) {
        var list = $('recommendation-results');
        list.replaceChildren();
        var item = document.createElement('p');
        item.className = 'recommendation-empty';
        item.textContent = message;
        list.appendChild(item);
    }
    function highlight(candidate) {
        if (highlighted) map.removeLayer(highlighted);
        highlighted = null;
        var feature = candidate.sourceFeature;
        if (feature && feature.geometry && feature.geometry.type !== 'Point') {
            highlighted = L.geoJSON(feature, {style:{color:'#ad3f2b',weight:6,opacity:0.95,fillColor:'#f3a36b',fillOpacity:0.24}}).addTo(map);
        }
        var latlng = [candidate.lat, candidate.lon];
        map.setView(latlng, Math.max(map.getZoom(), 16), {animate:true});
        if (!highlighted || !highlighted.getBounds || !highlighted.getBounds().isValid()) {
            highlighted = L.circleMarker(latlng, {radius:14,color:'#fff',weight:3,fillColor:'#ad3f2b',fillOpacity:1}).addTo(map);
        }
        if (feature && feature.properties) {
            var layers = window.parkingCandidateLayers || [];
            var marker = null;
            layers.some(function(layer) {
                layer.eachLayer(function(item) {
                    if (item.feature === feature || (item.feature && item.feature.properties && item.feature.properties.name === feature.properties.name)) marker = item;
                });
                return !!marker;
            });
            if (marker && marker.openPopup) marker.openPopup();
        }
    }
    function addUniqueAlternatives(result, candidates, duration, destinationPoint, originPoint) {
        var seen = {};
        result.recommendations.forEach(function(item) { seen[item.candidate.id] = true; });
        var alternatives = candidates.filter(function(candidate) {
            return candidate && !seen[candidate.id] && ParkingRanking.supportsDuration(candidate, duration) &&
                (candidate.type !== 'park_ride' || !!originPoint);
        }).map(function(candidate) {
            var prepared = Object.assign({}, candidate);
            prepared.distanceToDestinationKm = Number.isFinite(Number(candidate.distanceToDestinationKm)) ?
                Number(candidate.distanceToDestinationKm) : ParkingRanking.distanceKm(destinationPoint, candidate);
            prepared.distanceFromOriginKm = originPoint ? ParkingRanking.distanceKm(originPoint, candidate) : null;
            prepared.estimatedCost = ParkingRanking.estimateCost(candidate, duration);
            return prepared;
        }).sort(function(a,b) { return a.distanceToDestinationKm - b.distanceToDestinationKm; });
        alternatives.forEach(function(candidate) {
            if (result.recommendations.length >= 3 || seen[candidate.id]) return;
            seen[candidate.id] = true;
            result.recommendations.push({reason:'nearby_alternative',explanation:'Otra alternativa compatible y distinta disponible en los datos.',candidate:candidate});
        });
        return result;
    }
    function render(result) {
        var list = $('recommendation-results');
        list.replaceChildren();
        if (!result.recommendations.length) {
            showEmpty(result.needsOriginForParkRide ? 'Hay alternativas Park & Ride. Añade un origen en “Buscar aparcamiento” para compararlas. No recomendamos un disuasorio sin conocer desde dónde llegas.' : 'No hay opciones compatibles en el radio de búsqueda. Prueba otro destino o una estancia distinta.');
            return;
        }
        result.recommendations.forEach(function(entry) {
            var candidate = entry.candidate;
            var reason = reasonText(entry.reason);
            var warnings = restrictionWarnings(candidate);
            var card = document.createElement('article');
            card.className = 'recommendation-card';
            var lat = Number(candidate.lat), lon = Number(candidate.lon);
            var directions = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(lat + ',' + lon);
            var requirement = candidate.freeWhenEligible ? '<p class="recommendation-note">Gratis si haces y acreditas al menos un viaje en transporte público; valida condiciones del CRTM.</p>' : '';
            var warningHtml = warnings.length ? '<p class="recommendation-warning">' + warnings.map(escape).join(' · ') + '. Comprueba permisos y excepciones vigentes.</p>' : '<p class="recommendation-note">Consulta las restricciones ZBE antes de entrar; el mapa no comprueba la autorización de tu vehículo.</p>';
            card.innerHTML = '<div class="recommendation-kicker">' + escape(reason[0]) + '</div>' +
                '<h3>' + escape(candidate.label || 'Alternativa de aparcamiento') + '</h3>' +
                '<p class="recommendation-kind">' + escape(kindText(candidate)) + '</p>' +
                '<p>' + escape(reason[1]) + '</p>' +
                '<dl><div><dt>Al destino</dt><dd>' + escape(distanceText(candidate.distanceToDestinationKm)) + ' · línea recta</dd></div>' +
                '<div><dt>Duración</dt><dd>' + escape(durationText(candidate)) + '</dd></div>' +
                '<div><dt>Coste</dt><dd>' + escape(costText(candidate)) + '</dd></div></dl>' + requirement + warningHtml +
                '<div class="recommendation-actions"><button type="button" class="recommendation-focus">Ver en el mapa</button><a href="' + directions + '" target="_blank" rel="noopener noreferrer">Cómo llegar ↗</a></div>';
            card.querySelector('.recommendation-focus').addEventListener('click', function() { highlight(candidate); });
            list.appendChild(card);
        });
        if (result.needsOriginForParkRide) {
            var originHint = document.createElement('p');
            originHint.className = 'recommendation-note';
            originHint.textContent = 'También hay opciones Park & Ride; añade un origen en “Buscar aparcamiento” para compararlas. Verifica el trayecto y las condiciones de transporte público.';
            list.appendChild(originHint);
        }
    }
    function compute() {
        if (pending) return;
        if (!destination) { setStatus('Elige un destino para comparar opciones.'); showEmpty('Busca una dirección o marca el destino en el mapa.'); return; }
        var duration = Number($('parking-duration').value);
        if (!Number.isFinite(duration) || duration <= 0) { setStatus('Indica una duración válida.'); return; }
        pending = true;
        $('recommend-parking').disabled = true;
        setStatus('Preparando alternativas…');
        function candidatesReady() {
            var candidates = ParkingCandidates.browserCandidates(destination, duration);
            var result = ParkingRanking.recommend({destination:destination, origin:origin, durationHours:duration, candidates:candidates});
            render(addUniqueAlternatives(result,candidates,duration,destination,origin));
            setStatus(result.recommendations.length ? result.recommendations.length + ' recomendaciones. Distancias estimadas en línea recta.' : 'No se encontraron recomendaciones compatibles.');
        }
        var ready = window.ensureSerDecisionSource ? window.ensureSerDecisionSource(duration) : Promise.resolve();
        ready.then(candidatesReady).catch(function(error) {
            // Public parking and Park & Ride remain useful if the optional SER data request fails.
            var candidates = ParkingCandidates.browserCandidates(destination, duration);
            var result = ParkingRanking.recommend({destination:destination, origin:origin, durationHours:duration, candidates:candidates});
            render(addUniqueAlternatives(result,candidates,duration,destination,origin));
            setStatus('No se pudo cargar parte del SER. Se muestran las alternativas estáticas disponibles. ' + (error && error.message || ''));
        }).finally(function() {
            pending = false;
            $('recommend-parking').disabled = false;
        });
    }
    function refreshSources() {
        var settled = requiredSources.every(function(id) { return sourceStates[id] === 'ready' || sourceStates[id] === 'error'; });
        $('recommend-parking').disabled = !destination || !settled || pending;
    }
    function createControl() {
        control = L.control({position:'bottomleft'});
        control.onAdd = function() {
            var node = L.DomUtil.create('section', 'recommendation-sheet');
            node.innerHTML = '<details id="recommendation-details"><summary><span>Comparar dónde aparcar</span><small id="recommendation-summary">Elige un destino y una duración</small></summary>' +
                '<div class="recommendation-body"><label for="parking-duration">¿Cuánto tiempo?</label><select id="parking-duration"><option value="1">1 hora</option><option value="2">2 horas</option><option value="4">4 horas</option><option value="8" selected>8 horas</option><option value="12">12 horas</option></select>' +
                '<button id="recommend-parking" type="button" disabled>Comparar opciones</button><p id="recommendation-status" role="status" aria-live="polite">Elige un destino para comparar opciones.</p><div id="recommendation-results"></div>' +
                '<p class="recommendation-disclaimer">Información orientativa basada en datos publicados; no confirma plazas libres, precios actuales, rutas ni permisos de acceso.</p></div></details>';
            L.DomEvent.disableClickPropagation(node);
            L.DomEvent.disableScrollPropagation(node);
            node.querySelector('#recommend-parking').addEventListener('click', compute);
            node.querySelector('#parking-duration').addEventListener('change', function() { $('recommendation-summary').textContent = this.options[this.selectedIndex].text; });
            return node;
        };
        control.addTo(map);
    }
    window.addEventListener('parking:search-state', function(event) {
        destination = event.detail && event.detail.destination || null;
        origin = event.detail && event.detail.origin || null;
        $('recommendation-summary').textContent = destination ? 'Destino listo · ' + $('parking-duration').options[$('parking-duration').selectedIndex].text : 'Elige un destino y una duración';
        refreshSources();
        setStatus(destination ? 'Destino elegido. Ajusta la duración y compara.' : 'Elige un destino para comparar opciones.');
    });
    window.addEventListener('parking:source-updated', function() { refreshSources(); });
    window.addEventListener('parking-data', function(event) {
        window.parkingCandidateLayers = window.parkingCandidateLayers || [];
        window.parkingCandidateLayers.push(event.detail.layer);
        if (event.detail.config) sourceStates[event.detail.config.id] = 'ready';
        refreshSources();
    });
    window.addEventListener('parking-error', function(event) { sourceStates[event.detail.id] = 'error'; refreshSources(); });
    window.addEventListener('load', function() { refreshSources(); });
    document.addEventListener('DOMContentLoaded', createControl);
})();
