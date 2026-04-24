# Contributing to enrichment-kit

Thanks for wanting to contribute! This project moves fast and welcomes PRs.

## Quick start

```bash
git clone https://github.com/masteranime/enrichment-kit.git
cd enrichment-kit
npm install
npm run build
npm test
```

## Adding a new provider

1. Create `src/providers/yourprovider.ts` extending `BaseProvider`
2. Set `name`, `costPerCall`, `typicalHitRate`, `capabilities` accurately — these affect waterfall ordering
3. Implement `enrich(input)` returning `EnrichmentOutput | null`
4. Export from `src/providers/index.ts`
5. Add to `src/waterfall/builder.ts`
6. Add a test in `tests/providers/yourprovider.test.ts` (mock HTTP)
7. Document env var in README

### Pricing + hit rate honesty matters

Waterfall ordering depends on `costPerCall / typicalHitRate`. If you inflate hit rate, your provider gets called first for free and wastes users' money. Use the provider's published stats or your own measured data. Be honest.

## PR checklist

- [ ] TypeScript strict mode passes (`npm run build`)
- [ ] Tests pass (`npm test`)
- [ ] No external dependencies added without discussion
- [ ] README updated if user-facing change
- [ ] Anti-patterns / edge cases documented in code comments

## What gets merged fast

- New providers with accurate pricing/hit rates
- Cache adapters (Redis, SQLite, Cloudflare KV)
- Bug fixes with regression tests
- Doc improvements

## What needs discussion first

- New output fields (breaks schema)
- New dependencies
- Architecture changes to waterfall logic

Open an issue first for those.
