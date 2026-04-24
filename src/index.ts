export * from './types.js';
export * from './providers/index.js';
export * from './cache/index.js';
export { Waterfall } from './waterfall/index.js';
export { buildProviders, credentialsFromEnv } from './waterfall/builder.js';
export { validateEmail, validateLinkedInUrl, validateOutput } from './utils/validate.js';
export {
  normalizeEmail,
  extractDomain,
  normalizeName,
  splitFullName,
  canonicalKey,
} from './utils/normalize.js';

import { Waterfall } from './waterfall/index.js';
import { buildProviders, credentialsFromEnv } from './waterfall/builder.js';
import type { EnrichmentInput, EnrichmentResult, ProviderCredentials, CacheAdapter } from './types.js';

export async function enrich(
  input: EnrichmentInput,
  options: {
    credentials?: ProviderCredentials;
    cache?: CacheAdapter;
    minConfidence?: number;
    earlyExitOnConfidence?: number;
  } = {}
): Promise<EnrichmentResult> {
  const creds = options.credentials ?? credentialsFromEnv();
  const providers = buildProviders(creds);
  if (providers.length === 0) {
    throw new Error(
      'No providers configured. Set env vars (HUNTER_API_KEY, APOLLO_API_KEY, SERPAPI_API_KEY + GROQ_API_KEY, etc.) or pass credentials explicitly.'
    );
  }
  const waterfall = new Waterfall({
    providers,
    cache: options.cache,
    minConfidence: options.minConfidence,
    earlyExitOnConfidence: options.earlyExitOnConfidence,
  });
  return waterfall.enrich(input);
}
