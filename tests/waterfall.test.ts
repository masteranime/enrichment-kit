import { describe, it, expect } from 'vitest';
import { Waterfall } from '../src/waterfall/index.js';
import { MemoryCache } from '../src/cache/index.js';
import type { Provider, EnrichmentInput, EnrichmentOutput } from '../src/types.js';

function mockProvider(
  name: string,
  costPerCall: number,
  hitRate: number,
  result: Partial<EnrichmentOutput> | null
): Provider {
  return {
    name,
    costPerCall,
    typicalHitRate: hitRate,
    capabilities: ['email'],
    async enrich(_input: EnrichmentInput) {
      if (!result) return null;
      return {
        email: result.email ?? null,
        firstName: null,
        lastName: null,
        fullName: result.fullName ?? 'Test User',
        title: null,
        company: null,
        companyDomain: null,
        linkedinUrl: null,
        phone: null,
        location: null,
        confidence: result.confidence ?? 0.8,
        source: name,
        cost: costPerCall,
        enrichedAt: new Date().toISOString(),
      };
    },
  };
}

describe('Waterfall', () => {
  it('orders providers by effective cost', async () => {
    const expensive = mockProvider('expensive', 0.05, 0.5, { email: 'a@b.com', confidence: 0.9 });
    const cheap = mockProvider('cheap', 0.004, 0.55, { email: 'a@b.com', confidence: 0.9 });
    const wf = new Waterfall({ providers: [expensive, cheap], cache: new MemoryCache() });
    const r = await wf.enrich({ fullName: 'Test', company: 'Co' });
    expect(r.success).toBe(true);
    expect(r.data?.source).toBe('cheap');
  });

  it('falls through on miss', async () => {
    const miss = mockProvider('miss', 0.004, 0.55, null);
    const hit = mockProvider('hit', 0.02, 0.8, { email: 'a@b.com', confidence: 0.8 });
    const wf = new Waterfall({ providers: [miss, hit], cache: new MemoryCache() });
    const r = await wf.enrich({ fullName: 'Test', company: 'Co' });
    expect(r.success).toBe(true);
    expect(r.data?.source).toBe('hit');
    expect(r.attempts.length).toBe(2);
  });

  it('short-circuits on high confidence', async () => {
    const p1 = mockProvider('p1', 0.004, 0.55, { email: 'a@b.com', confidence: 0.95 });
    const p2 = mockProvider('p2', 0.02, 0.8, { email: 'a@b.com', confidence: 0.95 });
    const wf = new Waterfall({ providers: [p1, p2], cache: new MemoryCache(), earlyExitOnConfidence: 0.9 });
    const r = await wf.enrich({ fullName: 'Test', company: 'Co' });
    expect(r.attempts.length).toBe(1);
  });

  it('uses cache on repeat', async () => {
    let calls = 0;
    const p: Provider = {
      name: 'counting',
      costPerCall: 0.01,
      typicalHitRate: 0.8,
      capabilities: ['email'],
      async enrich() {
        calls++;
        return {
          email: 'a@b.com', firstName: null, lastName: null, fullName: 'T',
          title: null, company: null, companyDomain: null, linkedinUrl: null,
          phone: null, location: null, confidence: 0.9, source: 'counting',
          cost: 0.01, enrichedAt: new Date().toISOString(),
        };
      },
    };
    const wf = new Waterfall({ providers: [p], cache: new MemoryCache() });
    const input = { fullName: 'Test', company: 'Co' };
    await wf.enrich(input);
    const r2 = await wf.enrich(input);
    expect(calls).toBe(1);
    expect(r2.fromCache).toBe(true);
    expect(r2.totalCost).toBe(0);
  });

  it('returns null when all providers miss', async () => {
    const p = mockProvider('p', 0.004, 0.55, null);
    const wf = new Waterfall({ providers: [p], cache: new MemoryCache() });
    const r = await wf.enrich({ fullName: 'Test', company: 'Co' });
    expect(r.success).toBe(false);
    expect(r.data).toBeNull();
  });
});
