"use strict";

(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.LayerState = api;
    }
})(typeof self !== 'undefined' ? self : this, function () {
    function decode(value) {
        return decodeURIComponent((value || '').replace(/\+/g, ' '));
    }

    function parse(search) {
        var params = {};
        var value = (search || '').replace(/^\?/, '');
        if (!value) return params;
        value.split('&').forEach(function (definition) {
            if (!definition) return;
            var parts = definition.split('=', 2);
            params[decode(parts[0])] = parts.length > 1 ? decode(parts[1]) : '';
        });
        return params;
    }

    function parseIds(value) {
        if (!value) return [];
        return value.split(',').map(decode).filter(Boolean);
    }

    function encodeIds(ids) {
        return ids.map(encodeURIComponent).join(',');
    }

    function build(center, zoom, basemapId, selectedIds) {
        var parts = [
            'c=' + encodeURIComponent(center),
            'z=' + encodeURIComponent(String(zoom))
        ];
        if (basemapId) parts.push('b=' + encodeURIComponent(basemapId));
        if (selectedIds && selectedIds.length) parts.push('l=' + encodeIds(selectedIds));
        return parts.join('&');
    }

    return {
        parse: parse,
        parseIds: parseIds,
        build: build
    };
});
