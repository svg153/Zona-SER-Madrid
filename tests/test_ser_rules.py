from __future__ import annotations

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RULES_PATH = ROOT / "web" / "ser-rules.json"


class SerRulesTests(unittest.TestCase):
    def setUp(self) -> None:
        self.payload = json.loads(RULES_PATH.read_text(encoding="utf-8"))
        self.rules = self.payload["rules"]

    def test_expected_ser_types_are_documented(self) -> None:
        self.assertEqual(
            {"Verde", "Azul", "Naranja", "Rojo", "Alta Rotación"},
            set(self.rules),
        )

    def test_each_rule_has_user_facing_semantics(self) -> None:
        required = {"label", "summary", "maxStay", "cooldown", "price", "color"}
        for name, rule in self.rules.items():
            with self.subTest(name=name):
                self.assertTrue(required.issubset(rule))
                for field in required:
                    self.assertTrue(str(rule[field]).strip())

    def test_long_stay_rule_keeps_verified_limits(self) -> None:
        long_stay = self.rules["Naranja"]
        self.assertIn("12 h", long_stay["maxStay"])
        self.assertIn("0,50 €/h", long_stay["price"])

    def test_catalog_keeps_source_and_verification_date(self) -> None:
        self.assertTrue(self.payload["source"].startswith("https://"))
        self.assertRegex(self.payload["verifiedAt"], r"^\d{4}-\d{2}-\d{2}$")


if __name__ == "__main__":
    unittest.main()
