import { Waterfall } from '../src/waterfall/index.js';
import { buildProviders, credentialsFromEnv } from '../src/waterfall/builder.js';
import { FileCache } from '../src/cache/index.js';

const contacts = [
  { fullName: 'Brian Chesky', company: 'Airbnb' },
  { fullName: 'Patrick Collison', company: 'Stripe' },
  { fullName: 'Drew Houston', company: 'Dropbox' },
];

async function main() {
  const providers = buildProviders(credentialsFromEnv());
  if (providers.length === 0) {
    console.error('No providers configured. See README.');
    process.exit(1);
  }
  const waterfall = new Waterfall({
    providers,
    cache: new FileCache(),
    onAttempt: ({ provider, hit, latencyMs, cost }) => {
      console.log(`  ${provider}: ${hit ? '✓' : '✗'} ${latencyMs}ms $${cost.toFixed(4)}`);
    },
  });

  const results = await waterfall.enrichBatch(contacts, 2);
  for (let i = 0; i < results.length; i++) {
    const d = results[i].data;
    if (d) {
      console.log(`${contacts[i].fullName} → ${d.email ?? 'no email'} | ${d.title ?? ''} | ${d.linkedinUrl ?? ''}`);
    } else {
      console.log(`${contacts[i].fullName} → not found`);
    }
  }
  const totalCost = results.reduce((s, r) => s + r.totalCost, 0);
  console.log(`\nTotal spent: $${totalCost.toFixed(4)}`);
}

main().catch(console.error);
