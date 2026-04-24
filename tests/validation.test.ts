import { describe, it, expect } from 'vitest';
import { validateEmail, validateLinkedInUrl, validateOutput } from '../src/utils/validate.js';
import { canonicalKey, extractDomain, splitFullName } from '../src/utils/normalize.js';

describe('validateEmail', () => {
  it('accepts valid email', () => {
    expect(validateEmail('brian@airbnb.com').valid).toBe(true);
  });
  it('rejects malformed', () => {
    expect(validateEmail('not-an-email').valid).toBe(false);
  });
  it('flags role emails', () => {
    expect(validateEmail('info@company.com').isRole).toBe(true);
    expect(validateEmail('sales@company.com').isRole).toBe(true);
  });
  it('rejects placeholders', () => {
    expect(validateEmail('test@test.com').valid).toBe(false);
  });
});

describe('validateLinkedInUrl', () => {
  it('accepts standard /in/ URL', () => {
    expect(validateLinkedInUrl('https://linkedin.com/in/bchesky')).toBe(true);
    expect(validateLinkedInUrl('https://www.linkedin.com/in/bchesky/')).toBe(true);
  });
  it('rejects /company/ URLs', () => {
    expect(validateLinkedInUrl('https://linkedin.com/company/airbnb')).toBe(false);
  });
});

describe('validateOutput', () => {
  it('detects domain mismatch', () => {
    const r = validateOutput({
      email: 'someone@gmail.com',
      emailVerified: true,
      firstName: null, lastName: null, fullName: null,
      title: null, company: 'Airbnb', companyDomain: 'airbnb.com',
      linkedinUrl: null, phone: null, location: null,
      confidence: 0.9, source: 'test', cost: 0, enrichedAt: '',
    });
    expect(r.ok).toBe(false);
    expect(r.issues.some(i => i.includes('domain mismatch'))).toBe(true);
  });
});

describe('normalize', () => {
  it('extracts domain', () => {
    expect(extractDomain('foo@bar.com')).toBe('bar.com');
  });
  it('splits full name', () => {
    expect(splitFullName('Brian Chesky')).toEqual({ firstName: 'Brian', lastName: 'Chesky' });
    expect(splitFullName('Jean-Claude Van Damme')).toEqual({ firstName: 'Jean-Claude', lastName: 'Van Damme' });
  });
  it('canonical key is deterministic', () => {
    const a = canonicalKey({ email: 'Foo@Bar.COM ', company: 'Airbnb' });
    const b = canonicalKey({ email: 'foo@bar.com', company: 'Airbnb' });
    expect(a).toBe(b);
  });
});
