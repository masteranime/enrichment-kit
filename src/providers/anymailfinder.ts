import { BaseProvider } from './base.js';
import type { EnrichmentInput, EnrichmentOutput, ProviderCapability } from '../types.js';
import { extractDomain } from '../utils/normalize.js';

export class AnymailFinderProvider extends BaseProvider {
  name = 'anymailfinder';
  costPerCall = 0.008;
  typicalHitRate = 0.65;
  capabilities: ProviderCapability[] = ['email'];

  constructor(private apiKey: string) {
    super();
    if (!apiKey) throw new Error('Anymailfinder: apiKey required');
  }

  async enrich(input: EnrichmentInput): Promise<EnrichmentOutput | null> {
    const domain = input.domain ?? extractDomain(input.email);
    const fullName = input.fullName ?? [input.firstName, input.lastName].filter(Boolean).join(' ');
    if (!domain || !fullName) return null;

    const res = await this.httpRequest<{
      results: { email: string | null; validation: string };
      success: boolean;
    }>('https://api.anymailfinder.com/v5.0/search/person.json', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ full_name: fullName, domain }),
      timeoutMs: 180_000,
    });

    if (!res.success || !res.results?.email) return null;
    const verified = res.results.validation === 'valid';

    return this.makeOutput({
      email: res.results.email,
      emailVerified: verified,
      firstName: input.firstName,
      lastName: input.lastName,
      fullName,
      companyDomain: domain,
      confidence: verified ? 0.97 : 0.45,
      rawProviderData: res as unknown as Record<string, unknown>,
    });
  }
}
