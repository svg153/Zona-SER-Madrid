from __future__ import annotations

import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHECKER = ROOT / "scripts" / "check_workflow_freshness.py"


class WorkflowFreshnessTests(unittest.TestCase):
    def run_checker(self, last_success: str, now: str, max_age_hours: int = 216):
        return subprocess.run(
            [
                sys.executable,
                str(CHECKER),
                "--last-success",
                last_success,
                "--now",
                now,
                "--max-age-hours",
                str(max_age_hours),
            ],
            capture_output=True,
            text=True,
            check=False,
        )

    def test_recent_success_passes(self) -> None:
        result = self.run_checker("2026-09-20T02:00:00Z", "2026-09-24T02:00:00Z")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("Freshness check passed", result.stdout)

    def test_stale_success_fails(self) -> None:
        result = self.run_checker("2026-09-01T02:00:00Z", "2026-09-24T02:00:00Z")
        self.assertEqual(result.returncode, 1)
        self.assertIn("is stale", result.stdout)

    def test_future_timestamp_is_invalid(self) -> None:
        result = self.run_checker("2026-09-25T02:00:00Z", "2026-09-24T02:00:00Z")
        self.assertEqual(result.returncode, 2)


if __name__ == "__main__":
    unittest.main()
