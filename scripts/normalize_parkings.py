#!/usr/bin/env python3
"""Normalize Madrid municipal parking datasets to a small GeoJSON contract."""

from __future__ import annotations

import argparse
import csv
import html
import json
import re
from pathlib import Path
from typing import Any

DEFAULT_DATASET_URL = "https://datos.madrid.es/dataset/300531-0-aparcamientos-publicos"
DEFAULT_KIND = "municipal_park_ride"
DEFAULT_NAME = "Aparcamiento disuasorio municipal"


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
        cleaned = clean_text(item) if item else ""
        if cleaned and cleaned not in parts:
            parts.append(cleaned)
    return ", ".join(parts)


def coordinate_value(value: Any) -> float | None:
    if value in (None, ""):
        return None
    if isinstance(value, (int, float)):
        return float(value)

    text = str(value).strip().replace(",", ".")
    # The Madrid source has occasionally emitted duplicated minus signs.
    # Normalize only a repeated leading sign, never arbitrary numeric content.
    text = re.sub(r"^-{2,}(?=\d)", "-", text)
    try:
        return float(text)
    except ValueError:
        return None


def extract_coordinates(item: dict[str, Any]) -> list[float] | None:
    geometry = item.get("geometry")
    if isinstance(geometry, dict) and geometry.get("type") == "Point":
        coordinates = geometry.get("coordinates")
        if isinstance(coordinates, list) and len(coordinates) >= 2:
            longitude = coordinate_value(coordinates[0])
            latitude = coordinate_value(coordinates[1])
            if longitude is not None and latitude is not None:
                return [longitude, latitude]

    location = item.get("location")
    if isinstance(location, dict):
        latitude = coordinate_value(first_value(location, "latitude", "lat", "y"))
        longitude = coordinate_value(first_value(location, "longitude", "lng", "lon", "x"))
        if latitude is not None and longitude is not None:
            return [longitude, latitude]

    latitude = coordinate_value(first_value(item, "LATITUD", "latitude", "lat", "y"))
    longitude = coordinate_value(first_value(item, "LONGITUD", "longitude", "lng", "lon", "x"))
    if latitude is not None and longitude is not None:
        return [longitude, latitude]
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


def normalized_feature(
    item: dict[str, Any],
    *,
    kind: str,
    dataset_url: str,
    fallback_name: str,
) -> dict[str, Any] | None:
    props = source_properties(item)
    coordinates = extract_coordinates(item)
    if coordinates is None and props is not item:
        coordinates = extract_coordinates(props)
    if coordinates is None:
        return None

    name = clean_text(
        first_value(props, "title", "name", "nombre", "NOMBRE", "NAME")
    ) or fallback_name

    address = address_text(first_value(props, "address", "direccion", "DIRECCION"))
    if not address:
        address_parts = [
            clean_text(first_value(props, "CLASE-VIAL")),
            clean_text(first_value(props, "NOMBRE-VIA")),
            clean_text(first_value(props, "NUM")),
            clean_text(first_value(props, "CODIGO-POSTAL")),
            clean_text(first_value(props, "LOCALIDAD")),
        ]
        address = ", ".join(part for part in address_parts if part)

    description = nested_description(props)
    if not description:
        description = clean_text(
            first_value(
                props,
                "DESCRIPCION-ENTIDAD",
                "DESCRIPCION",
                "EQUIPAMIENTO",
            )
        )
    source_url = clean_text(first_value(props, "@id", "url", "URL", "CONTENT-URL")) or dataset_url

    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": coordinates},
        "properties": {
            "kind": kind,
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
    rows = payload.get("rows")
    if isinstance(rows, list):
        return [item for item in rows if isinstance(item, dict)]
    raise ValueError("Unsupported parking dataset: expected FeatureCollection, @graph or CSV rows")


def load_payload(path: Path) -> dict[str, Any]:
    if path.suffix.lower() != ".csv":
        return json.loads(path.read_text(encoding="utf-8-sig"))

    raw = path.read_bytes()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("cp1252")
    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=";,")
    except csv.Error:
        dialect = csv.excel
        dialect.delimiter = ";"
    rows = list(csv.DictReader(text.splitlines(), dialect=dialect))
    return {"rows": rows}


def normalize(
    payload: dict[str, Any],
    *,
    kind: str = DEFAULT_KIND,
    dataset_url: str = DEFAULT_DATASET_URL,
    fallback_name: str = DEFAULT_NAME,
) -> dict[str, Any]:
    features = []
    for item in source_items(payload):
        feature = normalized_feature(
            item,
            kind=kind,
            dataset_url=dataset_url,
            fallback_name=fallback_name,
        )
        if feature is not None:
            features.append(feature)

    if not features:
        raise ValueError("Parking dataset contains no usable point features")

    return {"type": "FeatureCollection", "source": dataset_url, "features": features}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--kind", default=DEFAULT_KIND)
    parser.add_argument("--dataset-url", default=DEFAULT_DATASET_URL)
    parser.add_argument("--fallback-name", default=DEFAULT_NAME)
    args = parser.parse_args()

    payload = load_payload(args.input)
    normalized = normalize(
        payload,
        kind=args.kind,
        dataset_url=args.dataset_url,
        fallback_name=args.fallback_name,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(normalized, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    print(f"Normalized {len(normalized['features'])} {args.kind} locations")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
