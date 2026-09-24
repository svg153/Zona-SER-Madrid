#!/usr/bin/env python3
"""Fail when the last successful updater run is older than the allowed age."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone


def parse_timestamp(value: str) -> datetime:
    normalized = value.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def age_hours(last_success: datetime, now: datetime) -> float:
    return (now - last_success).total_seconds() / 3600


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--last-success", required=True)
    parser.add_argument("--max-age-hours", type=float, default=216)
    parser.add_argument("--now", help="Override current UTC time for deterministic tests")
    args = parser.parse_args()

    last_success = parse_timestamp(args.last_success)
    now = parse_timestamp(args.now) if args.now else datetime.now(timezone.utc)
    age = age_hours(last_success, now)

    print(f"Last successful Weekly Data Update: {last_success.isoformat()}")
    print(f"Age: {age:.1f} hours; allowed maximum: {args.max_age_hours:.1f} hours")

    if age < 0:
        print("ERROR: last-success timestamp is in the future")
        return 2
    if age > args.max_age_hours:
        print("ERROR: Weekly Data Update is stale")
        return 1

    print("Freshness check passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
