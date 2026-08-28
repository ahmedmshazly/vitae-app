## Summary

<!-- What changed and why (1 to 3 bullets). -->

## Test plan

- [ ] Requirement / bug covered; `docs/testing/coverage-matrix.md` entries updated if ownership changed
- [ ] New or updated automated tests for the behavior (unit / property / API / web / e2e as needed)
- [ ] Negative path covered (auth fail, invalid input, empty/error UI, or space isolation)
- [ ] Accessibility / visual impact considered (`pnpm test:a11y`; visual only if UI chrome changed)
- [ ] Test titles/comments pass `pnpm test:prose` (no filler, no bulk dash stripping)

## Verification run locally

```bash
pnpm test:map && pnpm test:prose && pnpm test:unit && pnpm test:web && pnpm test:a11y
# if API/db touched:
pnpm test:api && pnpm test:security && pnpm test:resilience
# if UI journeys touched (stack up):
pnpm e2e
```
