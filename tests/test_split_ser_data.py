import json
import tempfile
import unittest
from pathlib import Path
from scripts.split_ser_data import COLORS, split

ROOT = Path(__file__).resolve().parents[1]

class SplitSerTests(unittest.TestCase):
    def test_regeneration_is_deterministic_and_preserves_features(self):
        source = ROOT / 'web/objects.geojson'
        with tempfile.TemporaryDirectory() as folder:
            counts = split(source, folder)
            originals = json.loads(source.read_text(encoding='utf-8'))['features']
            self.assertEqual(sum(counts.values()), len(originals))
            with tempfile.TemporaryDirectory() as second:
                self.assertEqual(counts, split(source, second))
                for name in counts:
                    self.assertEqual(Path(folder, name + '.geojson').read_bytes(), Path(second, name + '.geojson').read_bytes(), name)
            grouped = {name: [] for name in counts}
            for feature in originals:
                props = feature.get('properties') or {}
                geometry = feature.get('geometry') or {}
                name = COLORS.get(props.get('Color')) or ('meters' if geometry.get('type') == 'Point' else 'other')
                grouped[name].append({'type': 'Feature', 'geometry': geometry,
                                      'properties': {key: props[key] for key in ('Color', 'zona', 'description', 'style') if key in props}})
            for name, expected in grouped.items():
                self.assertEqual(json.loads(Path(folder, name + '.geojson').read_text(encoding='utf-8'))['features'], expected, name)
            self.assertLess(Path(folder, 'orange.geojson').stat().st_size, 50_000)
            self.assertLess(Path(folder, 'orange.geojson').stat().st_size, source.stat().st_size / 100)
