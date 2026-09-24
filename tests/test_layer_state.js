"use strict";

const assert = require('assert');
const LayerState = require('../web/layer-state.js');

const parsed = LayerState.parse('?c=40.41%2C-3.70&z=14&b=osm&l=ser%3Atype%3Aorange,parking%3Aaparca-t');
assert.strictEqual(parsed.c, '40.41,-3.70');
assert.strictEqual(parsed.z, '14');
assert.strictEqual(parsed.b, 'osm');
assert.deepStrictEqual(
    LayerState.parseIds(parsed.l),
    ['ser:type:orange', 'parking:aparca-t']
);

const query = LayerState.build(
    '40.410000,-3.700000',
    14,
    'osm',
    ['parking:aparca-t', 'ser:type:orange']
);
const roundTrip = LayerState.parse('?' + query);
assert.deepStrictEqual(
    LayerState.parseIds(roundTrip.l),
    ['parking:aparca-t', 'ser:type:orange']
);

const emptyQuery = LayerState.build('40.410000,-3.700000', 14, 'ign', []);
const emptyState = LayerState.parse('?' + emptyQuery);
assert.ok(Object.prototype.hasOwnProperty.call(emptyState, 'l'));
assert.deepStrictEqual(LayerState.parseIds(emptyState.l), []);

console.log('Layer state URL tests passed');
