import crypto from 'node:crypto';
import type { EnrichmentInput } from '../types.js';

export function normalizeEmail(email?: string): string | undefined {
  return email?.toLowerCase().trim();
}

export function extractDomain(email?: string): string | undefined {
  const e = normalizeEmail(email);
  return e?.split('@')[1];
}

export function normalizeName(name?: string): string | undefined {
  return name?.trim().replace(/\s+/g, ' ');
}

export function splitFullName(fullName?: string): { firstName?: string; lastName?: string } {
  if (!fullName) return {};
  const parts = normalizeName(fullName)!.split(' ');
  if (parts.length === 1) return { firstName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

export function canonicalKey(input: EnrichmentInput): string {
  const norm = {
    email: normalizeEmail(input.email) ?? '',
    linkedinUrl: input.linkedinUrl?.toLowerCase().replace(/\/$/, '') ?? '',
    fullName: input.fullName ? normalizeName(input.fullName)!.toLowerCase() : (
      [normalizeName(input.firstName), normalizeName(input.lastName)].filter(Boolean).join(' ').toLowerCase()
    ),
    company: input.company ? normalizeName(input.company)!.toLowerCase() : '',
    domain: input.domain?.toLowerCase().trim() ?? extractDomain(input.email) ?? '',
  };
  const keyStr = JSON.stringify(norm);
  return crypto.createHash('sha256').update(keyStr).digest('hex').slice(0, 24);
}

export function enrichInputFromPartial(input: EnrichmentInput): EnrichmentInput {
  const out = { ...input };
  if (!out.domain && out.email) out.domain = extractDomain(out.email);
  if (out.fullName && !out.firstName && !out.lastName) {
    const { firstName, lastName } = splitFullName(out.fullName);
    out.firstName = firstName;
    out.lastName = lastName;
  }
  if (!out.fullName && (out.firstName || out.lastName)) {
    out.fullName = [out.firstName, out.lastName].filter(Boolean).join(' ');
  }
  return out;
}
