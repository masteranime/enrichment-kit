import type {
  EnrichmentInput,
  EnrichmentResult,
  EnrichmentOutput,
  Provider,
  WaterfallConfig,
} from '../types.js';
import { canonicalKey, enrichInputFromPartial } from '../utils/normalize.js';
import { validateOutput } from '../utils/validate.js';
import { MemoryCache } from '../cache/index.js';

export class Waterfall {
  private providers: Provider[];
  private cache: NonNullable<WaterfallConfig['cache']>;
  private cacheTtlSeconds: number;
  private minConfidence: number;
  private earlyExitOnConfidence: number;
  private onAttempt?: WaterfallConfig['onAttempt'];

  constructor(config: WaterfallConfig) {
    if (config.providers.length === 0) {
      throw new Error('Waterfall requires at least one provider');
    }
    this.providers = this.sortByEffectiveCost(config.providers);
    this.cache = config.cache ?? new MemoryCache();
    this.cacheTtlSeconds = config.cacheTtlSeconds ?? 30 * 24 * 3600;
    this.minConfidence = config.minConfidence ?? 0.5;
    this.earlyExitOnConfidence = config.earlyExitOnConfidence ?? 0.85;
    this.onAttempt = config.onAttempt;
  }

  private sortByEffectiveCost(providers: Provider[]): Provider[] {
    return [...providers].sort(
      (a, b) => a.costPerCall / a.typicalHitRate - b.costPerCall / b.typicalHitRate
    );
  }

  async enrich(rawInput: EnrichmentInput): Promise<EnrichmentResult> {
    const input = enrichInputFromPartial(rawInput);
    const start = Date.now();
    const key = canonicalKey(input);

    const cached = await this.cache.get(key);
    if (cached) {
      return {
        success: true,
        data: cached,
        attempts: [],
        totalCost: 0,
        totalLatencyMs: Date.now() - start,
        fromCache: true,
      };
    }

    const attempts: EnrichmentResult['attempts'] = [];
    let totalCost = 0;
    let best: EnrichmentOutput | null = null;

    for (const provider of this.providers) {
      const attemptStart = Date.now();
      try {
        const result = await provider.enrich(input);
        const latencyMs = Date.now() - attemptStart;
        totalCost += provider.costPerCall;
        const hit = result != null && result.confidence >= this.minConfidence;

        attempts.push({ provider: provider.name, hit, latencyMs, cost: provider.costPerCall });
        this.onAttempt?.({ provider: provider.name, hit, latencyMs, cost: provider.costPerCall });

        if (result && result.confidence >= this.minConfidence) {
          const validation = validateOutput(result);
          if (!validation.ok) {
            continue;
          }
          if (!best || result.confidence > best.confidence) best = result;
          if (result.confidence >= this.earlyExitOnConfidence) break;
        }
      } catch (error) {
        const latencyMs = Date.now() - attemptStart;
        const errMessage = error instanceof Error ? error.message : String(error);
        attempts.push({
          provider: provider.name,
          hit: false,
          latencyMs,
          cost: 0,
          error: errMessage,
        });
        this.onAttempt?.({ provider: provider.name, hit: false, latencyMs, cost: 0 });
      }
    }

    if (best) {
      await this.cache.set(key, best, this.cacheTtlSeconds);
    }

    return {
      success: best != null,
      data: best,
      attempts,
      totalCost,
      totalLatencyMs: Date.now() - start,
      fromCache: false,
    };
  }

  async enrichBatch(inputs: EnrichmentInput[], concurrency = 3): Promise<EnrichmentResult[]> {
    const results: EnrichmentResult[] = new Array(inputs.length);
    let cursor = 0;
    const workers = Array.from({ length: concurrency }, async () => {
      while (true) {
        const i = cursor++;
        if (i >= inputs.length) return;
        results[i] = await this.enrich(inputs[i]);
      }
    });
    await Promise.all(workers);
    return results;
  }
}
