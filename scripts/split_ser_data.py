#!/usr/bin/env python3
"""Create small, independently loadable map layers from the canonical objects snapshot."""
import json
import sys
from pathlib import Path

COLORS = {'Verde': 'green', 'Azul': 'blue', 'Naranja': 'orange', 'Rojo': 'red', 'Alta Rotación': 'high-rotation', 'Gris': 'gray'}

def split(source, target):
    data = json.loads(Path(source).read_text(encoding='utf-8'))
    if data.get('type') != 'FeatureCollection' or not isinstance(data.get('features'), list):
        raise ValueError('Invalid objects FeatureCollection')
    groups = {name: [] for name in (*COLORS.values(), 'meters', 'other')}
    for feature in data['features']:
        props = feature.get('properties') or {}
        geometry = feature.get('geometry') or {}
        name = COLORS.get(props.get('Color')) or ('meters' if geometry.get('type') == 'Point' else 'other')
        # Only fields consumed by the viewer; original objects.geojson remains canonical.
        fields = {k: props[k] for k in ('Color', 'zona', 'description', 'style') if k in props}
        groups[name].append({'type': 'Feature', 'geometry': geometry, 'properties': fields})
    target = Path(target)
    target.mkdir(parents=True, exist_ok=True)
    for name, features in groups.items():
        (target / (name + '.geojson')).write_text(json.dumps({'type': 'FeatureCollection', 'features': features}, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    return {name: len(features) for name, features in groups.items()}

if __name__ == '__main__':
    print(split(sys.argv[1] if len(sys.argv) > 1 else 'web/objects.geojson', sys.argv[2] if len(sys.argv) > 2 else 'web/ser-data'))
