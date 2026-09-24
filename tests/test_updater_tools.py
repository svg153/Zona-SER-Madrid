from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIXTURE_WEB = ROOT / "tests" / "fixtures" / "web"
VALIDATOR = ROOT / "scripts" / "validate_geojson.py"
REPORTER = ROOT / "scripts" / "zone_report.py"


class UpdaterToolTests(unittest.TestCase):
    def test_valid_fixture_passes_validation(self) -> None:
        result = subprocess.run(
            [sys.executable, str(VALIDATOR), "--web-dir", str(FIXTURE_WEB)],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Validación pasada", result.stdout)

    def test_invalid_feature_collection_fails_validation(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            web_dir = Path(temp_dir) / "web"
            shutil.copytree(FIXTURE_WEB, web_dir)
            (web_dir / "zonas.geojson").write_text(
                '{"type":"Feature","features":[]}', encoding="utf-8"
            )

            result = subprocess.run(
                [sys.executable, str(VALIDATOR), "--web-dir", str(web_dir)],
                capture_output=True,
                text=True,
                check=False,
            )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("NOT FeatureCollection", result.stderr)

    def test_zone_report_is_generated_from_local_fixtures(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            output = Path(temp_dir) / "zone-report.md"
            result = subprocess.run(
                [
                    sys.executable,
                    str(REPORTER),
                    "--web-dir",
                    str(FIXTURE_WEB),
                    "--output",
                    str(output),
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            report = output.read_text(encoding="utf-8")

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("011 - Palacio", report)
        self.assertIn("| **Total** | | **1** |", report)
        self.assertIn("Parquímetros", report)


if __name__ == "__main__":
    unittest.main()
