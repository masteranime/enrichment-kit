import { BaseProvider } from './base.js';
import type { EnrichmentInput, EnrichmentOutput, ProviderCapability } from '../types.js';
import { extractDomain } from '../utils/normalize.js';

interface HunterEmailFinderResponse {
  data: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    score: number | null;
    domain: string | null;
    accept_all: boolean;
    position: string | null;
    twitter: string | null;
    linkedin_url: string | null;
    phone_number: string | null;
    company: string | null;
    sources: Array<{ domain: string; uri: string; extracted_on: string }>;
    verification: { date: string | null; status: string | null };
  };
}

export class HunterProvider extends BaseProvider {
  name = 'hunter';
  costPerCall = 0.004;
  typicalHitRate = 0.55;
  capabilities: ProviderCapability[] = ['email', 'title', 'linkedin', 'phone'];

  constructor(private apiKey: string) {
    super();
    if (!apiKey) throw new Error('Hunter: apiKey required');
  }

  async enrich(input: EnrichmentInput): Promise<EnrichmentOutput | null> {
    if (input.email) return this.verifyEmail(input.email);

    const domain = input.domain ?? extractDomain(input.email);
    if (!domain || (!input.firstName && !input.fullName)) return null;

    const firstName = input.firstName ?? input.fullName?.split(' ')[0];
    const lastName = input.lastName ?? input.fullName?.split(' ').slice(1).join(' ');

    const params = new URLSearchParams({
      domain,
      api_key: this.apiKey,
      ...(firstName ? { first_name: firstName } : {}),
      ...(lastName ? { last_name: lastName } : {}),
    });

    const url = `https://api.hunter.io/v2/email-finder?${params}`;
    const res = await this.httpRequest<HunterEmailFinderResponse>(url, { timeoutMs: 10_000 });
    const d = res.data;
    if (!d?.email) return null;

    const confidence = d.score != null ? d.score / 100 : 0.5;
    return this.makeOutput({
      email: d.email,
      emailVerified: d.verification?.status === 'valid',
      firstName: d.first_name,
      lastName: d.last_name,
      title: d.position,
      company: d.company,
      companyDomain: d.domain,
      linkedinUrl: d.linkedin_url,
      phone: d.phone_number,
      confidence,
      rawProviderData: d as unknown as Record<string, unknown>,
    });
  }

  private async verifyEmail(email: string): Promise<EnrichmentOutput | null> {
    const params = new URLSearchParams({ email, api_key: this.apiKey });
    const url = `https://api.hunter.io/v2/email-verifier?${params}`;
    const res = await this.httpRequest<{ data: { status: string; score: number; email: string } }>(url, { timeoutMs: 10_000 });
    const d = res.data;
    if (!d) return null;
    return this.makeOutput({
      email: d.email,
      emailVerified: d.status === 'valid',
      confidence: d.score / 100,
      rawProviderData: d as unknown as Record<string, unknown>,
    });
  }
}
