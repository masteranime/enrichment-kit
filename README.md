# enrichment-kit

> The open-source **Clay.com alternative**. Multi-vendor data enrichment waterfalls — bring your own API keys, pay ~**85% less per lead**.

[![npm](https://img.shields.io/npm/v/enrichment-kit?color=cb3837)](https://www.npmjs.com/package/enrichment-kit)
[![license](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![tests](https://img.shields.io/badge/tests-passing-brightgreen)](./tests)

```bash
npx enrichment-kit enrich --name "Brian Chesky" --company "Airbnb"
```

```
✓ Enriched
  Name         Brian Chesky
  Title        Co-Founder and CEO
  Company      Airbnb
  Email        brian.chesky@airbnb.com (verified)
  LinkedIn     https://linkedin.com/in/bchesky
  Confidence   92%
  Source       hunter

  Cost: $0.0040 | 842ms | 1 provider(s) tried
```

That's **$0.004 per verified contact**. Clay charges the equivalent of ~$0.12. Apollo solo costs ~$0.02. The difference is the **waterfall**.

---

## Why this exists

Clay.com is brilliant. It's also $149/month minimum, gatekept behind a sales call, and closed-source. The actual innovation — **running cheap enrichment providers in sequence and only falling through to expensive ones on a miss** — is a 200-line algorithm.

So here it is. Open-source. Bring your own API keys. Get the same cost curve Clay achieves, minus the SaaS markup.

---

## The waterfall pattern (why it saves money)

Naive enrichment calls all providers in parallel and picks the best result. You pay for every call on every lead. Cost stays flat even when the first provider would have been enough.

Waterfall enrichment orders providers by **effective cost** (`price / hit_rate`) and **short-circuits on success**:

```
Input: { fullName: "Brian Chesky", company: "Airbnb" }
  ↓
Hunter ($0.004, 55% hit rate)  ──hit──→  Done. Total cost: $0.004
  ↓ miss
Apollo ($0.01, 70% hit rate)    ──hit──→  Done. Total cost: $0.014
  ↓ miss
SerpAPI + LLM ($0.02, 80%)      ──hit──→  Done. Total cost: $0.034
  ↓ miss
Proxycurl ($0.03, 85%)          ──hit──→  Done. Total cost: $0.064
  ↓ miss
Unenrichable
```

For a 10k-lead list, typical cost lands near **$60 instead of $300**. That's the whole pitch.

---

## What it does

- ✅ **5 providers out of the box** — Hunter, Apollo, Anymailfinder, SerpAPI + LLM, Proxycurl
- ✅ **Bring your own keys** — no resale markup, pay providers direct
- ✅ **Auto-ordered waterfall** — effective cost routing, no config needed
- ✅ **Built-in cache** — file or memory, 30-day TTL by default, enrichments are ~40% cheaper after week 1
- ✅ **Semantic validation gate** — catches role emails, domain mismatches, malformed LinkedIn URLs before they corrupt your DB
- ✅ **CSV batch mode** — enrich 10k rows with one command
- ✅ **CLI + SDK** — use it as a tool or embed it
- ✅ **TypeScript-native** — full types, zero `any`

---

## Install

```bash
# One-shot CLI
npx enrichment-kit enrich --name "Brian Chesky" --company "Airbnb"

# Or install globally
npm install -g enrichment-kit

# Or as a library in your project
npm install enrichment-kit
```

---

## Get free-tier API keys (takes 10 minutes)

You need **at least one** of these. More = better waterfall coverage. All have free tiers.

| Provider | Free tier | Signup |
|---|---|---|
| **Hunter** | 25 searches/month | [hunter.io/sign-up](https://hunter.io/users/sign_up) |
| **Apollo** | 10k credits + 120 email credits/year on free plan | [apollo.io/signup](https://www.apollo.io/sign-up) |
| **SerpAPI** | 100 searches/month | [serpapi.com/users/sign_up](https://serpapi.com/users/sign_up) |
| **Groq** (LLM for SerpAPI extract) | Generous free tier, fastest | [console.groq.com](https://console.groq.com/keys) |
| **Anymailfinder** | Free trial credits | [anymailfinder.com](https://anymailfinder.com/pricing) |
| **Proxycurl** | 10 free credits | [nubela.co/proxycurl](https://nubela.co/proxycurl) |

Then set env vars:

```bash
export HUNTER_API_KEY=...
export APOLLO_API_KEY=...
export SERPAPI_API_KEY=...
export GROQ_API_KEY=...          # or OPENAI_API_KEY or ANTHROPIC_API_KEY
export ANYMAILFINDER_API_KEY=... # optional
export PROXYCURL_API_KEY=...     # optional
```

Check what's configured:

```bash
enrichment-kit providers
```

---

## CLI

### Single enrichment

```bash
enrichment-kit enrich --name "Patrick Collison" --company "Stripe"
enrichment-kit enrich --email "someone@example.com"
enrichment-kit enrich --linkedin "https://linkedin.com/in/..."
enrichment-kit enrich --name "..." --company "..." --json   # raw JSON out
```

### Batch mode — CSV in, CSV out

```bash
enrichment-kit batch leads.csv --output enriched.csv --concurrency 5
```

`leads.csv` needs at least one identifying column. The tool finds columns named `name`, `firstName`, `lastName`, `email`, `company`, `domain`, `linkedin` (case-insensitive, fuzzy). Output appends:
`enriched_email, enriched_linkedin, enriched_title, enriched_phone, enriched_confidence, enriched_source, enrichment_cost`

---

## SDK

```typescript
import { enrich } from 'enrichment-kit';

const result = await enrich({
  fullName: 'Brian Chesky',
  company: 'Airbnb',
});

if (result.success) {
  console.log(result.data.email);        // brian.chesky@airbnb.com
  console.log(result.data.confidence);   // 0.92
  console.log(result.totalCost);         // 0.004
}
```

### Full control — build your own waterfall

```typescript
import { Waterfall, HunterProvider, ApolloProvider, FileCache } from 'enrichment-kit';

const waterfall = new Waterfall({
  providers: [
    new HunterProvider(process.env.HUNTER_API_KEY!),
    new ApolloProvider(process.env.APOLLO_API_KEY!),
  ],
  cache: new FileCache('./my-cache'),
  cacheTtlSeconds: 14 * 24 * 3600,    // 14-day TTL
  minConfidence: 0.6,                  // drop results below 60% confidence
  earlyExitOnConfidence: 0.9,          // stop waterfall once a 90%+ match is found
  onAttempt: ({ provider, hit, cost, latencyMs }) => {
    console.log(`${provider}: ${hit ? 'HIT' : 'miss'} ($${cost}, ${latencyMs}ms)`);
  },
});

const result = await waterfall.enrich({ email: 'patrick@stripe.com' });
```

### Batch with concurrency

```typescript
const results = await waterfall.enrichBatch(contacts, 5);   // 5 parallel
const hits = results.filter(r => r.success).length;
const totalCost = results.reduce((s, r) => s + r.totalCost, 0);
console.log(`${hits}/${results.length} enriched, $${totalCost.toFixed(2)} total`);
```

---

## The semantic validation gate

The silent killer of enrichment pipelines isn't misses — it's **wrong data that looks right**. Hallucinated phone numbers. Trailing whitespace in IDs. Role emails (`info@`, `sales@`) that aren't real people. Domain mismatches where the email belongs to a different company than the enrichment claims.

Every result passes through `validateOutput()` before it touches the cache:

- Email format check
- Role-email detection (`info@`, `contact@`, `support@`, etc.)
- LinkedIn URL format validation
- Email-domain vs company-domain consistency
- Confidence bounds check

Low-confidence or invalid results are dropped, not returned. You can tune the threshold or inspect `result.attempts` to see every provider tried.

---

## Roadmap

- [ ] Redis cache adapter
- [ ] Bulk LinkedIn enrichment (batched Proxycurl)
- [ ] Company enrichment (`enrichCompany()`)
- [ ] Streaming results for very large batches
- [ ] More providers — Clearbit, Snov.io, ContactOut, Kaspr
- [ ] Cost analytics dashboard (CLI: `enrichment-kit stats`)
- [ ] Webhook mode (run as a HTTP service)

PRs welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## FAQ

**Is this legal?** Yes. You're calling APIs you have credentials for under each provider's terms.

**How is this different from Clay?** Clay is a no-code visual builder with hundreds of integrations and a polished UI. This is a library/CLI focused on the waterfall pattern. If you want drag-and-drop, use Clay. If you want a scriptable, self-hosted, dev-first tool, use this.

**Can I use this commercially?** MIT licensed, yes. No attribution required but appreciated.

**Why BYOK?** Because every reseller model has margins baked in. Direct provider access is cheaper and gives you rate-limit control.

**Will accuracy be lower without paid providers?** Accuracy comes from the **providers**, not this library. This library routes between them efficiently. With Hunter + SerpAPI + Groq (all have free tiers), you get 70-80% hit rate. Add Apollo, Proxycurl, Anymailfinder for 90%+.

**How do I contribute a new provider?** Fork, add a class extending `BaseProvider`, PR. See any existing provider for the pattern.

---

## Who built this

[Muhammad Shaheer](https://linkedin.com/in/muhammad-shaheer-898513192) — shipped 100+ production n8n workflows for clients, built the enrichment pattern from this library into real sales pipelines for startups. If you want the n8n version, see [n8n-claude-skills](https://github.com/masteranime/n8n-claude-skills).

---

## Acknowledgments

The Anymailfinder provider was tuned with input from [Alessandro Patti](https://www.linkedin.com/in/alessandro-patti/), co-founder of [Anymailfinder](https://anymailfinder.com), who reviewed the integration and contributed corrections to confidence scoring, timeout values, and hit rate calibration. This is exactly the kind of vendor-side knowledge open-source enrichment tooling needs more of.

If you work on a provider in this kit and want to contribute calibration improvements, [open an issue](https://github.com/masteranime/enrichment-kit/issues) — the same offer stands for everyone.

---

## License

MIT. Ship it.

---

**⭐ Star the repo if this saved you Clay's $149/month. PRs welcome.**
