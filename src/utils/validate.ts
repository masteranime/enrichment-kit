import type { EnrichmentOutput } from '../types.js';

const COMMON_FAKE_EMAILS = new Set([
  'test@test.com', 'email@example.com', 'user@domain.com', 'admin@admin.com',
  'noreply@example.com', 'no-reply@example.com',
]);

const ROLE_PREFIXES = new Set([
  'info', 'contact', 'hello', 'support', 'sales', 'admin', 'webmaster',
  'postmaster', 'no-reply', 'noreply', 'help', 'office',
]);

export function validateEmail(email: string): { valid: boolean; reason?: string; isRole: boolean } {
  const lower = email.toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lower)) return { valid: false, reason: 'malformed', isRole: false };
  if (COMMON_FAKE_EMAILS.has(lower)) return { valid: false, reason: 'placeholder', isRole: false };
  const local = lower.split('@')[0];
  const isRole = ROLE_PREFIXES.has(local);
  return { valid: true, isRole };
}

export function validateLinkedInUrl(url: string): boolean {
  return /^https:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/[a-zA-Z0-9-_%]+\/?$/.test(url.trim());
}

export function validateOutput(output: EnrichmentOutput): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  if (output.email) {
    const v = validateEmail(output.email);
    if (!v.valid) issues.push(`email invalid: ${v.reason}`);
    if (v.isRole) issues.push('email is role-based (info@, sales@, etc.)');
  }
  if (output.linkedinUrl && !validateLinkedInUrl(output.linkedinUrl)) issues.push('linkedinUrl invalid');
  if (output.confidence < 0 || output.confidence > 1) issues.push('confidence out of range');
  if (output.email && output.companyDomain) {
    const emailDomain = output.email.split('@')[1];
    if (emailDomain && output.companyDomain && !emailDomain.includes(output.companyDomain) && !output.companyDomain.includes(emailDomain.split('.')[0])) {
      issues.push('email domain mismatch with companyDomain');
    }
  }
  return { ok: issues.length === 0, issues };
}
