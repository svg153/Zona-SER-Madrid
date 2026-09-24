from __future__ import annotations

import unittest

from scripts.normalize_parkings import normalize


class NormalizeParkingsTests(unittest.TestCase):
    def test_geojson_feature_collection_is_normalized(self) -> None:
        payload = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [-3.722, 40.413]},
                    "properties": {
                        "title": "Aparcamiento disuasorio Avenida de Portugal",
                        "address": {"street-address": "Avenida de Portugal, 155", "locality": "Madrid"},
                        "organization": {"organization-desc": "Aparcamiento municipal disuasorio"},
                    },
                }
            ],
        }

        result = normalize(payload)
        feature = result["features"][0]
        self.assertEqual(feature["properties"]["kind"], "municipal_park_ride")
        self.assertIn("Avenida de Portugal", feature["properties"]["name"])
        self.assertIn("Avenida de Portugal, 155", feature["properties"]["address"])
        self.assertEqual(feature["geometry"]["coordinates"], [-3.722, 40.413])

    def test_same_normalizer_supports_public_municipal_parkings(self) -> None:
        payload = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [-3.703, 40.416]},
                    "properties": {"title": "Aparcamiento público de prueba"},
                }
            ],
        }
        source = "https://datos.madrid.es/dataset/202625-0-aparcamientos-publicos"
        result = normalize(
            payload,
            kind="municipal_public_parking",
            dataset_url=source,
            fallback_name="Aparcamiento público municipal",
        )
        feature = result["features"][0]
        self.assertEqual(feature["properties"]["kind"], "municipal_public_parking")
        self.assertEqual(feature["properties"]["sourceUrl"], source)

    def test_legacy_graph_location_is_supported(self) -> None:
        payload = {
            "@graph": [
                {
                    "@id": "https://example.test/parking/1",
                    "title": "Aparcamiento de prueba",
                    "location": {"latitude": 40.4, "longitude": -3.7},
                    "address": {"street-address": "Calle de prueba, 1"},
                }
            ]
        }

        result = normalize(payload)
        feature = result["features"][0]
        self.assertEqual(feature["geometry"]["coordinates"], [-3.7, 40.4])
        self.assertEqual(feature["properties"]["sourceUrl"], "https://example.test/parking/1")

    def test_dataset_without_usable_points_fails(self) -> None:
        with self.assertRaises(ValueError):
            normalize({"type": "FeatureCollection", "features": []})


if __name__ == "__main__":
    unittest.main()
