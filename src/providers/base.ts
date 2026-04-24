import type { Provider, EnrichmentInput, EnrichmentOutput, ProviderCapability } from '../types.js';

export abstract class BaseProvider implements Provider {
  abstract name: string;
  abstract costPerCall: number;
  abstract typicalHitRate: number;
  abstract capabilities: ProviderCapability[];

  abstract enrich(input: EnrichmentInput): Promise<EnrichmentOutput | null>;

  protected async httpRequest<T = unknown>(
    url: string,
    options: RequestInit & { timeoutMs?: number } = {}
  ): Promise<T> {
    const { timeoutMs = 10_000, ...fetchOptions } = options;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...fetchOptions, signal: controller.signal });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new ProviderError(`${this.name} HTTP ${response.status}`, response.status, body);
      }
      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  protected makeOutput(partial: Partial<EnrichmentOutput> & { confidence: number; source?: string }): EnrichmentOutput {
    return {
      email: partial.email ?? null,
      emailVerified: partial.emailVerified,
      firstName: partial.firstName ?? null,
      lastName: partial.lastName ?? null,
      fullName: partial.fullName ?? (partial.firstName || partial.lastName
        ? [partial.firstName, partial.lastName].filter(Boolean).join(' ')
        : null),
      title: partial.title ?? null,
      company: partial.company ?? null,
      companyDomain: partial.companyDomain ?? null,
      linkedinUrl: partial.linkedinUrl ?? null,
      phone: partial.phone ?? null,
      location: partial.location ?? null,
      confidence: partial.confidence,
      source: partial.source ?? this.name,
      cost: this.costPerCall,
      enrichedAt: new Date().toISOString(),
      rawProviderData: partial.rawProviderData,
    };
  }
}

export class ProviderError extends Error {
  constructor(message: string, public statusCode?: number, public body?: string) {
    super(message);
    this.name = 'ProviderError';
  }
}
