"use strict";

(function (root, factory) {
    var api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    else root.ParkingDestinationSearch = api;
})(typeof self !== "undefined" ? self : this, function () {
    var MADRID_VIEWBOX = "-3.95,40.62,-3.45,40.22";
    var MIN_REQUEST_INTERVAL_MS = 1100;

    function normalizePoint(value) {
        if (!value) return null;
        var lat = Number(value.lat);
        var lon = Number(value.lon !== undefined ? value.lon : value.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
        return {
            lat: lat,
            lon: lon,
            label: String(value.label || ""),
            source: String(value.source || "map")
        };
    }

    function createState() {
        return {destination: null, origin: null};
    }

    function updateState(state, kind, point) {
        if (kind !== "destination" && kind !== "origin") throw new Error("Unknown point kind: " + kind);
        var next = {destination: state.destination, origin: state.origin};
        next[kind] = normalizePoint(point);
        return next;
    }

    function createRateLimitedGeocoder(geocoder, options) {
        options = options || {};
        var now = options.now || Date.now;
        var schedule = options.schedule || function (fn, delay) { return setTimeout(fn, delay); };
        var minInterval = options.minIntervalMs || MIN_REQUEST_INTERVAL_MS;
        var cache = {};
        var lastRequestAt = -Infinity;
        var queue = Promise.resolve();

        function request(query) {
            var key = String(query || "").trim().toLowerCase();
            if (!key) return Promise.resolve([]);
            if (cache[key]) return Promise.resolve(cache[key]);

            queue = queue.then(function () {
                return new Promise(function (resolve, reject) {
                    var delay = Math.max(0, minInterval - (now() - lastRequestAt));
                    schedule(function () {
                        lastRequestAt = now();
                        try {
                            geocoder.geocode(query, function (results) {
                                cache[key] = Array.isArray(results) ? results : [];
                                resolve(cache[key]);
                            });
                        } catch (error) {
                            reject(error);
                        }
                    }, delay);
                });
            });
            return queue;
        }

        return {geocode: request, cache: cache};
    }

    function resultPoint(result) {
        if (!result || !result.center) return null;
        return normalizePoint({
            lat: result.center.lat,
            lon: result.center.lng,
            label: result.name || "",
            source: "geocoder"
        });
    }

    function init(map) {
        if (!map || typeof L === "undefined" || !L.Control || !L.Control.Geocoder) return null;

        var state = createState();
        var markers = {destination: null, origin: null};
        var pickMode = null;
        var geocoder = L.Control.Geocoder.nominatim({
            geocodingQueryParams: {
                countrycodes: "es",
                viewbox: MADRID_VIEWBOX
            }
        });
        var limitedGeocoder = createRateLimitedGeocoder(geocoder);

        function publish() {
            window.dispatchEvent(new CustomEvent("parking:search-state", {
                detail: {
                    destination: state.destination,
                    origin: state.origin
                }
            }));
        }

        function markerFor(kind, point) {
            if (markers[kind]) map.removeLayer(markers[kind]);
            markers[kind] = null;
            if (!point) return;

            markers[kind] = L.marker([point.lat, point.lon], {
                title: kind === "destination" ? "Destino" : "Origen"
            }).addTo(map);
            markers[kind].bindTooltip(kind === "destination" ? "Destino" : "Origen", {
                permanent: false,
                direction: "top"
            });
        }

        function setPoint(kind, point, pan) {
            state = updateState(state, kind, point);
            markerFor(kind, state[kind]);
            if (pan && state[kind]) map.panTo([state[kind].lat, state[kind].lon]);
            publish();
            return state[kind];
        }

        var SearchControl = L.Control.extend({
            options: {position: "topleft"},
            onAdd: function () {
                var container = L.DomUtil.create("div", "parking_search_control");
                var collapsed = window.matchMedia && window.matchMedia("(max-width: 700px)").matches;
                if (collapsed) L.DomUtil.addClass(container, "is-collapsed");

                var toggle = L.DomUtil.create("button", "parking_search_toggle", container);
                toggle.type = "button";
                toggle.setAttribute("aria-expanded", String(!collapsed));
                toggle.textContent = "Buscar aparcamiento";

                var body = L.DomUtil.create("div", "parking_search_body", container);
                body.appendChild(buildSearchRow("Destino", "destination", false));

                var originDetails = document.createElement("details");
                originDetails.className = "parking_search_origin";
                var summary = document.createElement("summary");
                summary.textContent = "Origen opcional";
                originDetails.appendChild(summary);
                originDetails.appendChild(buildSearchRow("Origen", "origin", true));
                body.appendChild(originDetails);

                var status = L.DomUtil.create("div", "parking_search_status", body);
                status.setAttribute("role", "status");
                status.setAttribute("aria-live", "polite");

                L.DomEvent.on(toggle, "click", function (event) {
                    L.DomEvent.stop(event);
                    var isCollapsed = container.classList.toggle("is-collapsed");
                    toggle.setAttribute("aria-expanded", String(!isCollapsed));
                });
                L.DomEvent.disableClickPropagation(container);
                L.DomEvent.disableScrollPropagation(container);

                function buildSearchRow(labelText, kind, allowLocation) {
                    var row = document.createElement("div");
                    row.className = "parking_search_row";

                    var label = document.createElement("label");
                    label.textContent = labelText;
                    var input = document.createElement("input");
                    input.type = "search";
                    input.autocomplete = "off";
                    input.placeholder = kind === "destination" ? "Dirección o lugar" : "Desde dónde vienes";
                    label.appendChild(input);
                    row.appendChild(label);

                    var actions = document.createElement("div");
                    actions.className = "parking_search_actions";

                    var search = document.createElement("button");
                    search.type = "button";
                    search.textContent = "Buscar";
                    search.addEventListener("click", function () {
                        runSearch(kind, input, row);
                    });
                    actions.appendChild(search);

                    var pick = document.createElement("button");
                    pick.type = "button";
                    pick.textContent = "Mapa";
                    pick.addEventListener("click", function () {
                        pickMode = kind;
                        status.textContent = "Toca el mapa para elegir " + labelText.toLowerCase() + ".";
                    });
                    actions.appendChild(pick);

                    if (allowLocation) {
                        var locate = document.createElement("button");
                        locate.type = "button";
                        locate.textContent = "Mi ubicación";
                        locate.addEventListener("click", function () {
                            if (!navigator.geolocation) {
                                status.textContent = "La geolocalización no está disponible.";
                                return;
                            }
                            status.textContent = "Obteniendo ubicación...";
                            navigator.geolocation.getCurrentPosition(function (position) {
                                setPoint("origin", {
                                    lat: position.coords.latitude,
                                    lon: position.coords.longitude,
                                    label: "Mi ubicación",
                                    source: "geolocation"
                                }, false);
                                status.textContent = "Origen actualizado con tu ubicación.";
                            }, function () {
                                status.textContent = "No se pudo obtener tu ubicación.";
                            }, {enableHighAccuracy: false, timeout: 8000, maximumAge: 60000});
                        });
                        actions.appendChild(locate);
                    }

                    var clear = document.createElement("button");
                    clear.type = "button";
                    clear.textContent = "Limpiar";
                    clear.addEventListener("click", function () {
                        input.value = "";
                        setPoint(kind, null, false);
                        var old = row.querySelector(".parking_search_results");
                        if (old) old.remove();
                        status.textContent = labelText + " eliminado.";
                    });
                    actions.appendChild(clear);
                    row.appendChild(actions);
                    return row;
                }

                function runSearch(kind, input, row) {
                    var query = input.value.trim();
                    if (!query) {
                        status.textContent = "Escribe una dirección o lugar.";
                        return;
                    }
                    status.textContent = "Buscando...";
                    limitedGeocoder.geocode(query).then(function (results) {
                        var previous = row.querySelector(".parking_search_results");
                        if (previous) previous.remove();

                        var resultsBox = document.createElement("div");
                        resultsBox.className = "parking_search_results";
                        row.appendChild(resultsBox);

                        if (!results.length) {
                            status.textContent = "No se encontraron resultados.";
                            return;
                        }

                        results.slice(0, 5).forEach(function (result) {
                            var point = resultPoint(result);
                            if (!point) return;
                            var button = document.createElement("button");
                            button.type = "button";
                            button.textContent = result.name || "Resultado";
                            button.addEventListener("click", function () {
                                input.value = result.name || query;
                                setPoint(kind, point, true);
                                resultsBox.remove();
                                status.textContent = (kind === "destination" ? "Destino" : "Origen") + " seleccionado.";
                            });
                            resultsBox.appendChild(button);
                        });
                        status.textContent = "Selecciona un resultado.";
                    }).catch(function () {
                        status.textContent = "El buscador no está disponible. Puedes elegir el punto en el mapa.";
                    });
                }

                map.on("click", function (event) {
                    if (!pickMode) return;
                    var kind = pickMode;
                    pickMode = null;
                    setPoint(kind, {
                        lat: event.latlng.lat,
                        lon: event.latlng.lng,
                        label: kind === "destination" ? "Punto elegido en mapa" : "Origen elegido en mapa",
                        source: "map"
                    }, false);
                    status.textContent = (kind === "destination" ? "Destino" : "Origen") + " seleccionado en el mapa.";
                });

                return container;
            }
        });

        var control = new SearchControl();
        control.addTo(map);

        return {
            getState: function () {
                return {destination: state.destination, origin: state.origin};
            },
            setDestination: function (point) { return setPoint("destination", point, true); },
            setOrigin: function (point) { return setPoint("origin", point, false); },
            control: control
        };
    }

    return {
        MADRID_VIEWBOX: MADRID_VIEWBOX,
        MIN_REQUEST_INTERVAL_MS: MIN_REQUEST_INTERVAL_MS,
        normalizePoint: normalizePoint,
        createState: createState,
        updateState: updateState,
        createRateLimitedGeocoder: createRateLimitedGeocoder,
        resultPoint: resultPoint,
        init: init
    };
});

if (typeof window !== "undefined" && typeof document !== "undefined") {
    window.addEventListener("DOMContentLoaded", function () {
        if (window.map && window.ParkingDestinationSearch) {
            window.parkingDestinationSearch = window.ParkingDestinationSearch.init(window.map);
        }
    });
}
