#!/usr/bin/env python3
"""Build the static CRTM Aparca+T GeoJSON layer from a reviewed catalog."""

from __future__ import annotations

import argparse
import json
from datetime import date
from pathlib import Path


def load_catalog(path: Path) -> dict:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not payload.get("source") or not payload.get("verifiedAt"):
        raise ValueError("Aparca+T catalog requires source and verifiedAt")
    parkings = payload.get("parkings")
    if not isinstance(parkings, list) or not parkings:
        raise ValueError("Aparca+T catalog must contain at least one parking")
    return payload


def build_geojson(catalog: dict) -> dict:
    features = []
    seen = set()
    for item in catalog["parkings"]:
        name = str(item.get("name", "")).strip()
        if not name or name in seen:
            raise ValueError(f"Invalid or duplicate Aparca+T name: {name!r}")
        seen.add(name)

        lat = float(item["lat"])
        lon = float(item["lon"])
        min_hours = int(item["minHours"])
        max_hours = int(item["maxHours"])
        spaces = int(item["spaces"])
        if not (40.0 <= lat <= 41.0 and -4.5 <= lon <= -3.0):
            raise ValueError(f"Coordinates outside Madrid region for {name}: {lat}, {lon}")
        if min_hours <= 0 or max_hours < min_hours or spaces <= 0:
            raise ValueError(f"Invalid parking constraints for {name}")

        properties = {
            "kind": "regional_park_ride",
            "name": name,
            "municipality": item.get("municipality", ""),
            "address": item.get("address", ""),
            "postalCode": item.get("postalCode", ""),
            "spaces": spaces,
            "minHours": min_hours,
            "maxHours": max_hours,
            "freeWhenEligible": bool(catalog.get("rules", {}).get("freeWhenEligible")),
            "sourceUrl": catalog["source"],
            "verifiedAt": catalog["verifiedAt"],
            "coordinatesApproximate": bool(item.get("coordinatesApproximate")),
            "coordinateSource": item.get("coordinateSource", ""),
        }
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [lon, lat]},
                "properties": properties,
            }
        )

    return {
        "type": "FeatureCollection",
        "source": catalog["source"],
        "verifiedAt": catalog["verifiedAt"],
        "rules": catalog.get("rules", {}),
        "features": features,
    }


def catalog_age_days(catalog: dict, today: date) -> int:
    verified = date.fromisoformat(catalog["verifiedAt"])
    return (today - verified).days


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--max-age-days", type=int, default=120)
    args = parser.parse_args()

    catalog = load_catalog(args.input)
    age = catalog_age_days(catalog, date.today())
    if age < 0:
        raise ValueError("Aparca+T verifiedAt cannot be in the future")
    if age > args.max_age_days:
        raise ValueError(
            f"Aparca+T catalog is stale: verified {age} days ago, limit is {args.max_age_days}"
        )

    output = build_geojson(catalog)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(output, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    print(f"Generated {len(output['features'])} Aparca+T locations; catalog age: {age} days")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
