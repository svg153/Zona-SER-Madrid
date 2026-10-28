'use strict';
(function() {
    var entries = [], destination, destinationMarker, selecting = false, failed = [], loading = {};
    var $ = function(id) { return document.getElementById(id); };
    var escape = escape_html;
    function clean(value) { return String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').replace(/, \{'@id'.*$/, '').trim(); }
    function kind(properties) { return properties.kind === 'regional_park_ride' ? 'Aparca+T CRTM' : properties.kind === 'municipal_park_ride' ? 'Disuasorio municipal' : 'Parking público municipal'; }
    function distance(entry) { return map.distance(destination, entry.marker.getLatLng()) / 1000; }
    function status() {
        var text = failed.length ? 'Datos incompletos: ' + failed.join(', ') : Object.keys(loading).length ? 'Cargando capas SER…' : 'Sin ocupación en directo';
        $('data-status').textContent = text;
        $('retry-data').hidden = !failed.some(function(x){return x.indexOf('SER ') === 0;});
    }
    window.addEventListener('ser-load-status', function(event) {
        var detail = event.detail;
        if (detail.status === 'loading') { loading[detail.name] = true; failed = failed.filter(function(x) { return x !== 'SER ' + detail.name; }); }
        else { delete loading[detail.name]; if (detail.status === 'error' && failed.indexOf('SER ' + detail.name) < 0) failed.push('SER ' + detail.name); }
        status();
    });
    window.addEventListener('parking-error', function(event) { failed.push(event.detail.label); status(); });
    window.addEventListener('parking-data', function(event) {
        var layer = event.detail.layer;
        layer.eachLayer(function(marker) { entries.push({marker:marker, feature:marker.feature, layer:layer}); });
        setTimeout(render, 0);
    });
    function render() {
        var query = $('parking-search').value.trim().toLocaleLowerCase('es');
        var shown = entries.filter(function(entry) {
            var p = entry.feature.properties || {};
            return map.hasLayer(entry.layer) && entry.layer.hasLayer(entry.marker) && (!query || (p.name + ' ' + (p.address || '') + ' ' + kind(p)).toLocaleLowerCase('es').includes(query)) && (destination || query || map.getBounds().contains(entry.marker.getLatLng()));
        });
        shown.sort(destination ? function(a,b) { return distance(a)-distance(b); } : function(a,b) { return (a.feature.properties.name||'').localeCompare(b.feature.properties.name||'', 'es'); });
        $('results-title').textContent = destination ? 'Opciones cerca del destino' : query ? 'Resultados de búsqueda' : 'Aparcamientos en el mapa';
        $('results-hint').textContent = destination ? 'Ordenados por distancia en línea recta, no por tiempo o ruta.' : 'Mueve el mapa o marca un destino para ordenar por cercanía.';
        $('result-count').textContent = shown.length;
        $('empty-results').hidden = shown.length > 0;
        var cards = $('parking-results'); cards.replaceChildren();
        shown.slice(0,12).forEach(function(entry) {
            var p=entry.feature.properties || {}, pos=entry.marker.getLatLng();
            var card=document.createElement('article'); card.className='parking-card';
            var d=destination ? distance(entry) : null;
            card.innerHTML='<div class="kind">'+escape(kind(p))+'</div><h3>'+escape(p.name || 'Aparcamiento')+'</h3><p>'+escape(clean(p.address) || 'Dirección no disponible')+'</p>'+(d !== null ? '<p class="distance">'+(d < 1 ? Math.round(d*1000)+' m' : d.toFixed(1)+' km')+' en línea recta</p>' : '')+'<p>'+(p.kind === 'regional_park_ride' ? 'Gratis con transporte público y condiciones · ' : '')+'Precio y ocupación actuales: sin dato</p>'+(p.coordinatesApproximate ? '<p>Ubicación aproximada</p>' : '')+'<button type="button">Ver en el mapa</button><a target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/dir/?api=1&destination='+pos.lat+','+pos.lng+'">Cómo llegar ↗</a>'+(p.sourceUrl ? '<a target="_blank" rel="noopener noreferrer" href="'+escape(p.sourceUrl)+'">Fuente ↗</a>' : '');
            card.querySelector('button').addEventListener('click',function(){map.setView(pos,15);entry.marker.openPopup();$('map').scrollIntoView({behavior:'smooth',block:'center'});});
            cards.appendChild(card);
        });
        if (shown.length > 12) { var more=document.createElement('p'); more.textContent='Mostrando 12 de '+shown.length+'. Acerca el mapa o busca por nombre.'; cards.appendChild(more); }
    }
    function stateButton(button, ids) {
        var registered=ids.filter(function(id){return overlay_registry[id];});
        button.setAttribute('aria-pressed', String(registered.length > 0 && registered.every(function(id){return map.hasLayer(overlay_registry[id].layer);})));
        button.disabled = registered.length === 0;
    }
    var serIds=Object.keys(SER_TYPE_IDS).map(function(k){return SER_TYPE_IDS[k];});
    var rideIds=['parking:municipal-park-ride','parking:aparca-t'], publicIds=['parking:public-municipal'];
    function syncButtons() { stateButton($('all-ser'),serIds);stateButton($('rides'),rideIds);stateButton($('public-parking'),publicIds); }
    function toggle(ids) {
        var items=ids.map(function(id){return overlay_registry[id];}).filter(Boolean);
        var enable=!items.every(function(item){return map.hasLayer(item.layer);});
        items.forEach(function(item){if(enable && !map.hasLayer(item.layer)) map.addLayer(item.layer);else if(!enable && map.hasLayer(item.layer)) map.removeLayer(item.layer);});
        refresh_ser_display(); request_ser_for_selection(); compute_url();
        syncButtons(); render();
    }
    window.addEventListener('overlay-registered', function(){syncButtons();render();});
    window.addEventListener('parking-deduplicated', render);
    window.addEventListener('parking:search-state', function(event) {
        var point = event.detail && event.detail.destination;
        destination = point ? L.latLng(point.lat, point.lon) : null;
        $('destination-notice').hidden = !destination;
        $('choose-destination').textContent = destination ? 'Cambiar destino' : 'Marcar destino';
        render();
    });

    $('retry-data').onclick=function(){request_ser_for_selection(true);};
    $('all-ser').onclick=function(){toggle(serIds);}; $('rides').onclick=function(){toggle(rideIds);}; $('public-parking').onclick=function(){toggle(publicIds);};
    $('parking-search').addEventListener('input',render);
    $('choose-destination').onclick=function(){selecting=!selecting;window.destination_selection_active=selecting;this.classList.toggle('choosing',selecting);this.textContent=selecting?'Toca el mapa para elegir':'Marcar destino';};
    map.on('click',function(e){
        if (!selecting) return;
        destination=e.latlng; selecting=false; window.destination_selection_active=false; $('choose-destination').classList.remove('choosing'); $('choose-destination').textContent='Cambiar destino';
        if(destinationMarker) map.removeLayer(destinationMarker);
        destinationMarker=L.circleMarker(destination,{radius:9,color:'#fff',weight:3,fillColor:'#c75239',fillOpacity:1}).addTo(map).bindPopup('Destino seleccionado');
        $('destination-notice').hidden=false; render();
    });
    $('clear-destination').onclick=function(){destination=null;if(destinationMarker)map.removeLayer(destinationMarker);if(window.parkingDestinationSearch)window.parkingDestinationSearch.setDestination(null);$('destination-notice').hidden=true;$('choose-destination').textContent='Marcar destino';render();};
    map.on('moveend overlayadd overlayremove',function(){syncButtons();render();});
    syncButtons(); status();
})();
