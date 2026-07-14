import { describe, expect, it } from 'vitest';
import { loginEmail, validLogin } from './account';

describe('username logins', () => {
  it('maps plain usernames to the synthetic domain, case-insensitively', () => {
    expect(loginEmail('Keeb')).toBe('keeb@players.dicemancer');
    expect(loginEmail('  keeb ')).toBe('keeb@players.dicemancer');
  });

  it('passes real emails through untouched (legacy accounts)', () => {
    expect(loginEmail('Jake@Example.com')).toBe('jake@example.com');
  });

  it('validates usernames and emails', () => {
    expect(validLogin('keeb')).toBe(true);
    expect(validLogin('ab')).toBe(true);
    expect(validLogin('a')).toBe(false); // too short
    expect(validLogin('has space')).toBe(false);
    expect(validLogin('jake@example.com')).toBe(true);
    expect(validLogin('not-an-email@')).toBe(false);
  });
});
