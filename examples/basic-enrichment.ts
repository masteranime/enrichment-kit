import { enrich } from '../src/index.js';

async function main() {
  const result = await enrich({
    fullName: 'Brian Chesky',
    company: 'Airbnb',
  });

  if (result.success && result.data) {
    console.log('Name:', result.data.fullName);
    console.log('Title:', result.data.title);
    console.log('LinkedIn:', result.data.linkedinUrl);
    console.log('Email:', result.data.email);
    console.log('Confidence:', `${(result.data.confidence * 100).toFixed(0)}%`);
    console.log('Source:', result.data.source);
  } else {
    console.log('No enrichment found.');
  }

  console.log(`\nTotal cost: $${result.totalCost.toFixed(4)}`);
  console.log(`Latency: ${result.totalLatencyMs}ms`);
  console.log(`Providers tried: ${result.attempts.map(a => `${a.provider}(${a.hit ? '✓' : '✗'})`).join(' → ')}`);
}

main().catch(console.error);
