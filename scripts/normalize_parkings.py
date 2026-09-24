#!/usr/bin/env python3
"""Normalize Madrid municipal parking datasets to a small GeoJSON contract.

The Madrid open-data portal has exposed equipment data both as GeoJSON
FeatureCollections and as JSON-LD documents with an ``@graph`` array. This
normalizer accepts both so the map does not depend on one portal generation.
"""

from __future__ import annotations

import argparse
import html
import json
import re
from pathlib import Path
from typing import Any

DATASET_URL = "https://datos.madrid.es/dataset/300531-0-aparcamientos-publicos"


def first_value(mapping: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        value = mapping.get(key)
        if value not in (None, "", []):
            return value
    return None


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    text = str(value)
    text = re.sub(r"<br\s*/?>", " · ", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = html.unescape(text)
    return " ".join(text.split())


def address_text(value: Any) -> str:
    if isinstance(value, str):
        return clean_text(value)
    if not isinstance(value, dict):
        return ""

    parts = []
    for key in (
        "street-address",
        "streetAddress",
        "address",
        "postal-code",
        "postalCode",
        "locality",
        "district",
    ):
        item = value.get(key)
        if item and clean_text(item) not in parts:
            parts.append(clean_text(item))
    return ", ".join(parts)


def extract_coordinates(item: dict[str, Any]) -> list[float] | None:
    geometry = item.get("geometry")
    if isinstance(geometry, dict) and geometry.get("type") == "Point":
        coordinates = geometry.get("coordinates")
        if (
            isinstance(coordinates, list)
            and len(coordinates) >= 2
            and all(isinstance(value, (int, float)) for value in coordinates[:2])
        ):
            return [float(coordinates[0]), float(coordinates[1])]

    location = item.get("location")
    if isinstance(location, dict):
        latitude = first_value(location, "latitude", "lat", "y")
        longitude = first_value(location, "longitude", "lng", "lon", "x")
        try:
            if latitude is not None and longitude is not None:
                return [float(longitude), float(latitude)]
        except (TypeError, ValueError):
            pass
    return None


def source_properties(item: dict[str, Any]) -> dict[str, Any]:
    properties = item.get("properties")
    return properties if isinstance(properties, dict) else item


def nested_description(props: dict[str, Any]) -> str:
    organization = props.get("organization")
    if isinstance(organization, dict):
        value = first_value(
            organization,
            "organization-desc",
            "organizationDesc",
            "description",
        )
        if value:
            return clean_text(value)

    return clean_text(
        first_value(
            props,
            "organization-desc",
            "organizationDesc",
            "description",
            "relation",
            "details",
        )
    )


def normalized_feature(item: dict[str, Any]) -> dict[str, Any] | None:
    props = source_properties(item)
    coordinates = extract_coordinates(item)
    if coordinates is None and props is not item:
        coordinates = extract_coordinates(props)
    if coordinates is None:
        return None

    name = clean_text(
        first_value(
            props,
            "title",
            "name",
            "nombre",
            "NOMBRE",
            "NAME",
        )
    )
    if not name:
        name = "Aparcamiento disuasorio municipal"

    address = address_text(first_value(props, "address", "direccion", "DIRECCION"))
    description = nested_description(props)
    source_url = clean_text(first_value(props, "@id", "url", "URL")) or DATASET_URL

    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": coordinates},
        "properties": {
            "kind": "municipal_park_ride",
            "name": name,
            "address": address,
            "description": description,
            "sourceUrl": source_url,
        },
    }


def source_items(payload: dict[str, Any]) -> list[dict[str, Any]]:
    if payload.get("type") == "FeatureCollection" and isinstance(payload.get("features"), list):
        return [item for item in payload["features"] if isinstance(item, dict)]
    graph = payload.get("@graph")
    if isinstance(graph, list):
        return [item for item in graph if isinstance(item, dict)]
    raise ValueError("Unsupported parking dataset: expected FeatureCollection or @graph")


def normalize(payload: dict[str, Any]) -> dict[str, Any]:
    features = []
    for item in source_items(payload):
        feature = normalized_feature(item)
        if feature is not None:
            features.append(feature)

    if not features:
        raise ValueError("Parking dataset contains no usable point features")

    return {
        "type": "FeatureCollection",
        "source": DATASET_URL,
        "features": features,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    payload = json.loads(args.input.read_text(encoding="utf-8-sig"))
    normalized = normalize(payload)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(normalized, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    print(f"Normalized {len(normalized['features'])} municipal park-and-ride locations")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
