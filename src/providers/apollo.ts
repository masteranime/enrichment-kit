import { BaseProvider } from './base.js';
import type { EnrichmentInput, EnrichmentOutput, ProviderCapability } from '../types.js';

interface ApolloMatchResponse {
  person: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    name: string | null;
    email: string | null;
    email_status: string | null;
    linkedin_url: string | null;
    title: string | null;
    phone_numbers: Array<{ raw_number: string; sanitized_number: string; type: string }>;
    organization: { name: string | null; website_url: string | null; primary_domain: string | null } | null;
    city: string | null;
    state: string | null;
    country: string | null;
  } | null;
}

export class ApolloProvider extends BaseProvider {
  name = 'apollo';
  costPerCall = 0.01;
  typicalHitRate = 0.70;
  capabilities: ProviderCapability[] = ['email', 'linkedin', 'phone', 'title', 'company'];

  constructor(private apiKey: string) {
    super();
    if (!apiKey) throw new Error('Apollo: apiKey required');
  }

  async enrich(input: EnrichmentInput): Promise<EnrichmentOutput | null> {
    const body: Record<string, unknown> = {
      reveal_personal_emails: true,
      reveal_phone_number: false,
    };
    if (input.email) body.email = input.email;
    if (input.linkedinUrl) body.linkedin_url = input.linkedinUrl;
    if (input.firstName) body.first_name = input.firstName;
    if (input.lastName) body.last_name = input.lastName;
    if (input.company) body.organization_name = input.company;
    if (input.domain) body.domain = input.domain;

    const res = await this.httpRequest<ApolloMatchResponse>('https://api.apollo.io/api/v1/people/match', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': this.apiKey,
      },
      body: JSON.stringify(body),
      timeoutMs: 12_000,
    });

    const p = res.person;
    if (!p) return null;

    const phone = p.phone_numbers?.[0]?.sanitized_number ?? null;
    const location = [p.city, p.state, p.country].filter(Boolean).join(', ') || null;

    const confidence = p.email && p.email_status === 'verified' ? 0.9
      : p.email ? 0.75
      : p.linkedin_url ? 0.65
      : 0.5;

    return this.makeOutput({
      email: p.email,
      emailVerified: p.email_status === 'verified',
      firstName: p.first_name,
      lastName: p.last_name,
      fullName: p.name,
      title: p.title,
      company: p.organization?.name ?? null,
      companyDomain: p.organization?.primary_domain ?? null,
      linkedinUrl: p.linkedin_url,
      phone,
      location,
      confidence,
      rawProviderData: p as unknown as Record<string, unknown>,
    });
  }
}
