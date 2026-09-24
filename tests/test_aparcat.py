from __future__ import annotations

import json
import unittest
from datetime import date
from pathlib import Path

from scripts.build_aparcat_geojson import build_geojson, catalog_age_days, load_catalog

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "sources" / "aparcat.json"


class AparcaTTests(unittest.TestCase):
    def setUp(self) -> None:
        self.catalog = load_catalog(CATALOG)

    def test_current_catalog_contains_official_eight_locations(self) -> None:
        names = {item["name"] for item in self.catalog["parkings"]}
        self.assertEqual(
            names,
            {
                "Ciudad Universitaria",
                "Estación de El Barrial",
                "Estación de Colmenar Viejo",
                "Estación de Las Rozas",
                "Estación de Pinar de las Rozas",
                "Estación de Las Matas",
                "Estación de Majadahonda",
                "Antiguo Matadero",
            },
        )

    def test_rules_keep_verified_stay_windows(self) -> None:
        by_name = {item["name"]: item for item in self.catalog["parkings"]}
        self.assertEqual(by_name["Ciudad Universitaria"]["maxHours"], 16)
        self.assertEqual(by_name["Estación de Colmenar Viejo"]["maxHours"], 15)
        self.assertEqual(by_name["Antiguo Matadero"]["maxHours"], 15)
        self.assertTrue(self.catalog["rules"]["requiresPublicTransportTrip"])

    def test_builder_creates_valid_regional_park_ride_features(self) -> None:
        output = build_geojson(self.catalog)
        self.assertEqual(len(output["features"]), 8)
        for feature in output["features"]:
            self.assertEqual(feature["properties"]["kind"], "regional_park_ride")
            self.assertGreater(feature["properties"]["spaces"], 0)
            lon, lat = feature["geometry"]["coordinates"]
            self.assertTrue(-4.5 <= lon <= -3.0)
            self.assertTrue(40.0 <= lat <= 41.0)

    def test_catalog_freshness_is_measurable(self) -> None:
        self.assertEqual(catalog_age_days(self.catalog, date(2026, 9, 24)), 0)
        self.assertGreater(catalog_age_days(self.catalog, date(2027, 1, 23)), 120)


if __name__ == "__main__":
    unittest.main()
