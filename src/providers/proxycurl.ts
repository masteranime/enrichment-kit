import { BaseProvider } from './base.js';
import type { EnrichmentInput, EnrichmentOutput, ProviderCapability } from '../types.js';

interface ProxycurlProfile {
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  occupation: string | null;
  headline: string | null;
  city: string | null;
  country_full_name: string | null;
  experiences: Array<{ company: string | null; title: string | null; starts_at: unknown; ends_at: unknown | null }>;
}

export class ProxycurlProvider extends BaseProvider {
  name = 'proxycurl';
  costPerCall = 0.03;
  typicalHitRate = 0.85;
  capabilities: ProviderCapability[] = ['linkedin', 'title', 'company'];

  constructor(private apiKey: string) {
    super();
    if (!apiKey) throw new Error('Proxycurl: apiKey required');
  }

  async enrich(input: EnrichmentInput): Promise<EnrichmentOutput | null> {
    if (!input.linkedinUrl) return null;

    const params = new URLSearchParams({
      url: input.linkedinUrl,
      use_cache: 'if-present',
    });
    const res = await this.httpRequest<ProxycurlProfile>(
      `https://nubela.co/proxycurl/api/v2/linkedin?${params}`,
      {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        timeoutMs: 25_000,
      }
    );

    if (!res.full_name && !res.first_name) return null;

    const currentJob = res.experiences?.find(e => !e.ends_at);
    const location = [res.city, res.country_full_name].filter(Boolean).join(', ') || null;

    return this.makeOutput({
      firstName: res.first_name,
      lastName: res.last_name,
      fullName: res.full_name,
      title: currentJob?.title ?? res.occupation,
      company: currentJob?.company ?? null,
      linkedinUrl: input.linkedinUrl,
      location,
      confidence: 0.95,
      rawProviderData: res as unknown as Record<string, unknown>,
    });
  }
}
