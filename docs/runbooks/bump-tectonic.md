# Runbook: bump the Tectonic (LaTeX) version

The résumé compiler is pinned for reproducibility. Upgrading is a deliberate,
tested step (SRS R3: guards against silent layout drift).

1. Edit `TECTONIC_VERSION` in `services/buildsvc/Dockerfile`.
2. Rebuild and run the calibration fixture (must stay 1 page):
   ```bash
   docker build -t vitae/buildsvc:local -f services/buildsvc/Dockerfile .
   docker run --rm --network none vitae/buildsvc:local node dist/calibrate.js
   ```
   Image build runs calibrate and fails if measured capacity drifts more than
   **±3 lines** from each template's configured `lines_per_page`.
3. Compile a known résumé end-to-end and confirm the page meter still tracks the
   real output within ±3 lines (SRS FR-RES-009). If it drifts, update the
   `line-model.json` constants for the affected template and re-run calibration.
4. If a stored résumé must stay byte-identical, it references its template
   version and `SOURCE_DATE_EPOCH`; re-exporting it should reproduce the same PDF.
