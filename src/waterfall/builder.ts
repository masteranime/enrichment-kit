import type { Provider, ProviderCredentials } from '../types.js';
import {
  HunterProvider,
  ApolloProvider,
  SerpApiLLMProvider,
  AnymailFinderProvider,
  ProxycurlProvider,
} from '../providers/index.js';

export function buildProviders(creds: ProviderCredentials): Provider[] {
  const providers: Provider[] = [];
  if (creds.hunter?.apiKey) providers.push(new HunterProvider(creds.hunter.apiKey));
  if (creds.anymailfinder?.apiKey) providers.push(new AnymailFinderProvider(creds.anymailfinder.apiKey));
  if (creds.apollo?.apiKey) providers.push(new ApolloProvider(creds.apollo.apiKey));
  if (creds.serpapi?.apiKey && creds.serpapi.llmApiKey) {
    providers.push(new SerpApiLLMProvider(
      creds.serpapi.apiKey,
      creds.serpapi.llmProvider ?? 'groq',
      creds.serpapi.llmApiKey
    ));
  }
  if (creds.proxycurl?.apiKey) providers.push(new ProxycurlProvider(creds.proxycurl.apiKey));
  return providers;
}

export function credentialsFromEnv(env: NodeJS.ProcessEnv = process.env): ProviderCredentials {
  const creds: ProviderCredentials = {};
  if (env.HUNTER_API_KEY) creds.hunter = { apiKey: env.HUNTER_API_KEY };
  if (env.APOLLO_API_KEY) creds.apollo = { apiKey: env.APOLLO_API_KEY };
  if (env.SERPAPI_API_KEY) {
    creds.serpapi = {
      apiKey: env.SERPAPI_API_KEY,
      llmProvider: (env.LLM_PROVIDER as 'groq' | 'openai' | 'anthropic') ?? 'groq',
      llmApiKey:
        env.LLM_PROVIDER === 'openai' ? env.OPENAI_API_KEY :
        env.LLM_PROVIDER === 'anthropic' ? env.ANTHROPIC_API_KEY :
        (env.GROQ_API_KEY ?? env.OPENAI_API_KEY ?? env.ANTHROPIC_API_KEY),
    };
  }
  if (env.ANYMAILFINDER_API_KEY) creds.anymailfinder = { apiKey: env.ANYMAILFINDER_API_KEY };
  if (env.PROXYCURL_API_KEY) creds.proxycurl = { apiKey: env.PROXYCURL_API_KEY };
  return creds;
}
