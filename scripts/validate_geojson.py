#!/usr/bin/env python3
"""Validate the generated GeoJSON files without requiring network access."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

EXPECTED_FILES = {
    "zonas.geojson": {"min_features": 1},
    "objects.geojson": {"min_features": 1, "sample_property": "description"},
    "calles.geojson": {"min_features": 1, "sample_property": "zona"},
    "parquimetros.geojson": {"min_features": 1},
    "crosses.geojson": {"min_features": 0},
    "disuasorios.geojson": {"min_features": 1, "sample_property": "kind"},
    "parkings-publicos.geojson": {"min_features": 1, "sample_property": "kind"},
}


def append_github_output(path: str | None, key: str, value: str | int) -> None:
    if not path:
        return
    with open(path, "a", encoding="utf-8") as handle:
        handle.write(f"{key}={value}\n")


def validate_file(path: Path, spec: dict[str, object]) -> tuple[int, list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []

    if not path.is_file():
        return 0, [f"MISSING: {path}"], warnings

    try:
        with path.open(encoding="utf-8") as handle:
            payload = json.load(handle)
    except (json.JSONDecodeError, OSError) as exc:
        return 0, [f"INVALID JSON: {path}: {exc}"], warnings

    if payload.get("type") != "FeatureCollection":
        errors.append(f"NOT FeatureCollection: {path} (got: {payload.get('type')!r})")
        return 0, errors, warnings

    features = payload.get("features")
    if not isinstance(features, list):
        errors.append(f"INVALID features array: {path}")
        return 0, errors, warnings

    count = len(features)
    minimum = int(spec.get("min_features", 0))
    if count < minimum:
        errors.append(f"TOO FEW FEATURES: {path} ({count} < {minimum} minimum)")

    sample_property = spec.get("sample_property")
    if sample_property and features:
        properties = features[0].get("properties") or {}
        if sample_property not in properties:
            warnings.append(
                f"{path.name} may be missing '{sample_property}' property in the first feature"
            )

    return count, errors, warnings


def validate_web_dir(web_dir: Path) -> tuple[int, int, list[str], list[str]]:
    total_features = 0
    total_files = 0
    errors: list[str] = []
    warnings: list[str] = []

    for filename, spec in EXPECTED_FILES.items():
        count, file_errors, file_warnings = validate_file(web_dir / filename, spec)
        errors.extend(file_errors)
        warnings.extend(file_warnings)
        if not file_errors:
            total_files += 1
            total_features += count
            print(f"  ✓ {web_dir / filename}: {count} features")

    return total_files, total_features, errors, warnings


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--web-dir", type=Path, default=Path("web"))
    parser.add_argument("--github-output")
    parser.add_argument("--github-step-summary")
    args = parser.parse_args()

    total_files, total_features, errors, warnings = validate_web_dir(args.web_dir)

    append_github_output(args.github_output, "total_features", total_features)
    append_github_output(args.github_output, "total_files", total_files)

    for warning in warnings:
        print(f"⚠ {warning}", file=sys.stderr)

    if errors:
        for error in errors:
            print(f"✗ {error}", file=sys.stderr)
        if args.github_step_summary:
            with open(args.github_step_summary, "a", encoding="utf-8") as handle:
                handle.write("### ❌ Validación GeoJSON fallida\n\n")
                for error in errors:
                    handle.write(f"- {error}\n")
        return 1

    print(f"✅ Validación pasada: {total_files} archivos, {total_features} features totales")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
