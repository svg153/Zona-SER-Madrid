# Weekly data updater operations

## What healthy means

`Weekly Data Update` runs every Monday at 02:00 UTC. A successful run is healthy even when the Madrid source data has not changed and therefore no pull request is created.

`Data Freshness Watch` runs daily and fails when the latest successful weekly update is older than 216 hours (9 days). This detects a disabled schedule or a persistently failing updater without treating a quiet municipal dataset as stale data.

## Manual verification

From GitHub Actions:

1. Open `Weekly Data Update`.
2. Choose `Run workflow` on `master`.
3. Confirm the Docker build, source download, GeoJSON validation and report steps complete successfully.
4. If generated GeoJSON differs from `master`, confirm the automated `data/weekly-update` PR is created.
5. If no data differs, confirm the run succeeds without creating an empty PR.

For the fast offline checks:

```bash
python3 -m unittest discover -s tests -p 'test_*.py' -v
```

## Failure modes

### HTTP/download failure

`scripts/update-data.sh` uses fail-fast HTTP requests with retries. A 4xx/5xx response must fail the run rather than being interpreted as an unchanged dataset.

Actions:

1. Open the source URL in the Madrid Geoportal/ArcGIS service.
2. Check whether the resource moved or is temporarily unavailable.
3. Do not replace an official source with a scrape unless a separate decision documents that fallback.
4. Re-run the workflow after the official endpoint recovers or after updating the canonical URL.

### Source schema changed

The updater validates ArcGIS responses as GeoJSON `FeatureCollection` objects with a `features` array before processing. Generated files are validated again by `scripts/validate_geojson.py`.

Actions:

1. Compare the new official response with the assumptions in `scripts/update-data.sh` and `src/process_shp.sh`.
2. Update parsing/transformation and fixtures together.
3. Add or update an offline regression test before merging the schema adaptation.
4. Run the full workflow manually once after merge.

### Freshness watch failed

A freshness failure means no successful `Weekly Data Update` has completed within 9 days. It does not mean Madrid necessarily changed its data.

Actions:

1. Inspect recent `Weekly Data Update` runs.
2. If the workflow is disabled, re-enable it and run it manually.
3. If runs are failing, fix the first deterministic failure before changing the freshness threshold.
4. Only change the 216-hour threshold if the intended weekly cadence itself changes.

## Deployment boundary

All updater work runs in GitHub Actions and produces static files for GitHub Pages. No backend or Vercel runtime is required for this operational model.
