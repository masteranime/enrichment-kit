import { z } from 'zod';

export const EnrichmentInputSchema = z.object({
  email: z.string().email().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  fullName: z.string().optional(),
  company: z.string().optional(),
  domain: z.string().optional(),
  linkedinUrl: z.string().url().optional(),
}).refine(
  (data) => data.email || data.linkedinUrl || (data.fullName && data.company) || ((data.firstName || data.lastName) && data.company) || data.domain,
  { message: 'Provide at least one of: email, linkedinUrl, (fullName + company), (firstName/lastName + company), or domain' }
);

export type EnrichmentInput = z.infer<typeof EnrichmentInputSchema>;

export const EnrichmentOutputSchema = z.object({
  email: z.string().nullable(),
  emailVerified: z.boolean().optional(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  fullName: z.string().nullable(),
  title: z.string().nullable(),
  company: z.string().nullable(),
  companyDomain: z.string().nullable(),
  linkedinUrl: z.string().nullable(),
  phone: z.string().nullable(),
  location: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  source: z.string(),
  cost: z.number().min(0),
  enrichedAt: z.string(),
  rawProviderData: z.record(z.unknown()).optional(),
});

export type EnrichmentOutput = z.infer<typeof EnrichmentOutputSchema>;

export const EnrichmentResultSchema = z.object({
  success: z.boolean(),
  data: EnrichmentOutputSchema.nullable(),
  attempts: z.array(z.object({
    provider: z.string(),
    hit: z.boolean(),
    latencyMs: z.number(),
    cost: z.number(),
    error: z.string().optional(),
  })),
  totalCost: z.number(),
  totalLatencyMs: z.number(),
  fromCache: z.boolean().optional(),
});

export type EnrichmentResult = z.infer<typeof EnrichmentResultSchema>;

export interface Provider {
  name: string;
  costPerCall: number;
  typicalHitRate: number;
  capabilities: ProviderCapability[];
  enrich(input: EnrichmentInput): Promise<EnrichmentOutput | null>;
}

export type ProviderCapability = 'email' | 'linkedin' | 'phone' | 'title' | 'company' | 'domain';

export interface CacheAdapter {
  get(key: string): Promise<EnrichmentOutput | null>;
  set(key: string, value: EnrichmentOutput, ttlSeconds?: number): Promise<void>;
  has(key: string): Promise<boolean>;
}

export interface ProviderCredentials {
  hunter?: { apiKey: string };
  apollo?: { apiKey: string };
  serpapi?: { apiKey: string; llmProvider?: 'groq' | 'openai' | 'anthropic'; llmApiKey?: string };
  anymailfinder?: { apiKey: string };
  clearbit?: { apiKey: string };
  proxycurl?: { apiKey: string };
}

export interface WaterfallConfig {
  providers: Provider[];
  cache?: CacheAdapter;
  cacheTtlSeconds?: number;
  minConfidence?: number;
  earlyExitOnConfidence?: number;
  onAttempt?: (attempt: { provider: string; hit: boolean; latencyMs: number; cost: number }) => void;
}
