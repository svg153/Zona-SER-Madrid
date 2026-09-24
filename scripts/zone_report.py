#!/usr/bin/env python3
"""Generate the parking-by-zone Markdown report from local GeoJSON files."""

from __future__ import annotations

import argparse
import json
import os
from collections import defaultdict
from pathlib import Path


def read_geojson(path: Path) -> dict:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def count_by_zona(geojson: dict) -> tuple[dict[str, int], int]:
    counts: dict[str, int] = defaultdict(int)
    no_zona = 0
    for feature in geojson.get("features", []):
        properties = feature.get("properties") or {}
        zona = properties.get("zona")
        if zona is None or zona == "None" or zona == "--":
            no_zona += 1
        else:
            counts[str(zona)] += 1
    return dict(counts), no_zona


def build_report(web_dir: Path) -> tuple[str, dict[str, int]]:
    calles = read_geojson(web_dir / "calles.geojson")
    calles_by_zona, calles_no_zona = count_by_zona(calles)

    parquimetros = read_geojson(web_dir / "parquimetros.geojson")
    parquimetros_total = len(parquimetros.get("features", []))

    crosses = read_geojson(web_dir / "crosses.geojson")
    crosses_by_zona, crosses_no_zona = count_by_zona(crosses)

    zonas = read_geojson(web_dir / "zonas.geojson")
    barrios = {
        str(feature.get("properties", {}).get("zona")): feature.get("properties", {}).get("name")
        for feature in zonas.get("features", [])
    }

    lines = [
        "## Parking by Zone",
        "",
        "### Parking Spaces by Zone",
        "",
        "| Zone | Barrio | Spaces |",
        "|------|--------|--------|",
    ]

    for zona in sorted(calles_by_zona):
        lines.append(f"| {zona} | {barrios.get(zona, zona)} | {calles_by_zona[zona]:,} |")
    if calles_no_zona:
        lines.append(f"| -- | (sin zona) | {calles_no_zona:,} |")
    lines.append(f"| **Total** | | **{sum(calles_by_zona.values()):,}** |")
    lines.append("")

    lines.extend(
        [
            "### Crosses (Bandas entre 2 zonas)",
            "",
            "| Zone | Barrio | Spaces |",
            "|------|--------|--------|",
        ]
    )
    for zona in sorted(crosses_by_zona):
        lines.append(f"| {zona} | {barrios.get(zona, zona)} | {crosses_by_zona[zona]} |")
    if crosses_no_zona:
        lines.append(f"| -- | (sin zona) | {crosses_no_zona} |")
    lines.append(f"| **Total** | | **{sum(crosses_by_zona.values()):,}** |")
    lines.append("")
    lines.append(f"**Parquímetros**: {parquimetros_total} total (zona no asignada en fuente)")
    lines.append("")

    metrics = {
        "total_spaces": sum(calles_by_zona.values()),
        "total_crosses": sum(crosses_by_zona.values()),
        "parquimetros": parquimetros_total,
        "zones_with_data": len(calles_by_zona),
    }
    return "\n".join(lines), metrics


def append_github_outputs(path: str | None, report: str, metrics: dict[str, int]) -> None:
    if not path:
        return
    with open(path, "a", encoding="utf-8") as handle:
        for key, value in metrics.items():
            handle.write(f"{key}={value}\n")
        handle.write("report<<ZONE_REPORT_EOF\n")
        handle.write(report)
        handle.write("\nZONE_REPORT_EOF\n")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--web-dir", type=Path, default=Path("web"))
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--github-output", default=os.environ.get("GITHUB_OUTPUT"))
    args = parser.parse_args()

    report, metrics = build_report(args.web_dir)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(report, encoding="utf-8")
    append_github_outputs(args.github_output, report, metrics)

    print(
        "Zone report: "
        f"{metrics['zones_with_data']} zones, "
        f"{metrics['total_spaces']:,} spaces, "
        f"{metrics['total_crosses']} crosses, "
        f"{metrics['parquimetros']} parquimetros"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
