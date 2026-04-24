import { BaseProvider } from './base.js';
import type { EnrichmentInput, EnrichmentOutput, ProviderCapability } from '../types.js';

interface SerpApiResponse {
  organic_results?: Array<{ title?: string; link?: string; snippet?: string; displayed_link?: string }>;
  knowledge_graph?: Record<string, unknown>;
}

export class SerpApiLLMProvider extends BaseProvider {
  name = 'serpapi-llm';
  costPerCall = 0.02;
  typicalHitRate = 0.80;
  capabilities: ProviderCapability[] = ['linkedin', 'title', 'company'];

  constructor(
    private serpApiKey: string,
    private llmProvider: 'groq' | 'openai' | 'anthropic' = 'groq',
    private llmApiKey?: string
  ) {
    super();
    if (!serpApiKey) throw new Error('SerpApiLLM: serpApiKey required');
    if (!llmApiKey) throw new Error('SerpApiLLM: llmApiKey required');
  }

  async enrich(input: EnrichmentInput): Promise<EnrichmentOutput | null> {
    const fullName = input.fullName ?? [input.firstName, input.lastName].filter(Boolean).join(' ');
    if (!fullName && !input.email) return null;

    const queryParts = [
      fullName ? `"${fullName}"` : null,
      input.company ? `"${input.company}"` : null,
      'site:linkedin.com/in',
    ].filter(Boolean);
    const query = queryParts.join(' ');

    const serpParams = new URLSearchParams({
      q: query,
      api_key: this.serpApiKey,
      engine: 'google',
      num: '5',
    });
    const serpData = await this.httpRequest<SerpApiResponse>(
      `https://serpapi.com/search.json?${serpParams}`,
      { timeoutMs: 15_000 }
    );

    const results = serpData.organic_results ?? [];
    if (results.length === 0) return null;

    const extracted = await this.llmExtract({
      query: { fullName, company: input.company, domain: input.domain },
      serpResults: results.slice(0, 5).map(r => ({
        title: r.title ?? '',
        link: r.link ?? '',
        snippet: r.snippet ?? '',
      })),
    });

    if (!extracted || extracted.confidence < 0.5) return null;

    return this.makeOutput({
      fullName: extracted.fullName ?? fullName,
      firstName: input.firstName,
      lastName: input.lastName,
      title: extracted.title,
      company: extracted.company ?? input.company,
      linkedinUrl: extracted.linkedinUrl,
      location: extracted.location,
      confidence: extracted.confidence,
      rawProviderData: { serpResults: results.slice(0, 3), extracted },
    });
  }

  private async llmExtract(payload: unknown): Promise<{
    linkedinUrl: string | null;
    title: string | null;
    company: string | null;
    fullName: string | null;
    location: string | null;
    confidence: number;
  } | null> {
    const systemPrompt = `You extract person contact data from Google search results.

Return ONLY a JSON object with exactly these keys: linkedinUrl, title, company, fullName, location, confidence.
- linkedinUrl: the most likely linkedin.com/in/... URL for this person, or null
- title: their job title if present in a snippet, or null
- company: their employer if clear, or null
- fullName: their full name as written on LinkedIn, or null
- location: city/country if mentioned, or null
- confidence: 0-1 score for how certain you are this is the right person

Rules:
- Only use linkedin.com/in/ URLs, never /company/ or /pub/.
- If multiple candidates match, pick the one matching the provided company.
- If no result clearly matches the target person, set confidence below 0.5 and most fields to null.
- Do not fabricate data. If a field is not in the search results, return null.`;

    const userPrompt = `Query: ${JSON.stringify(payload)}

Return the JSON object only, no markdown, no prose.`;

    try {
      const response = await this.callLLM(systemPrompt, userPrompt);
      const parsed = JSON.parse(response);
      if (typeof parsed.confidence !== 'number') return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private async callLLM(systemPrompt: string, userPrompt: string): Promise<string> {
    if (this.llmProvider === 'groq') {
      const res = await this.httpRequest<{ choices: Array<{ message: { content: string } }> }>(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.llmApiKey}`,
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0,
            response_format: { type: 'json_object' },
            max_tokens: 400,
          }),
          timeoutMs: 15_000,
        }
      );
      return res.choices[0]?.message?.content ?? '{}';
    }
    if (this.llmProvider === 'openai') {
      const res = await this.httpRequest<{ choices: Array<{ message: { content: string } }> }>(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.llmApiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0,
            response_format: { type: 'json_object' },
            max_tokens: 400,
          }),
          timeoutMs: 15_000,
        }
      );
      return res.choices[0]?.message?.content ?? '{}';
    }
    const res = await this.httpRequest<{ content: Array<{ text: string }> }>(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.llmApiKey ?? '',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 400,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
        timeoutMs: 20_000,
      }
    );
    return res.content[0]?.text ?? '{}';
  }
}
