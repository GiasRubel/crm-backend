import {
  decryptToken,
  deriveCalendarEncryptionKey,
  encryptToken,
} from './token-crypto.util';

describe('token-crypto.util', () => {
  const key = deriveCalendarEncryptionKey('test-secret');

  it('round-trips a token through encrypt/decrypt', () => {
    const encrypted = encryptToken('ya29.some-access-token', key);
    expect(encrypted).not.toContain('ya29');
    expect(decryptToken(encrypted, key)).toBe('ya29.some-access-token');
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const a = encryptToken('same-plaintext', key);
    const b = encryptToken('same-plaintext', key);
    expect(a).not.toBe(b);
  });

  it('fails to decrypt with the wrong key', () => {
    const encrypted = encryptToken('secret-value', key);
    const wrongKey = deriveCalendarEncryptionKey('different-secret');
    expect(() => decryptToken(encrypted, wrongKey)).toThrow();
  });

  it('derives the same key for the same secret', () => {
    expect(deriveCalendarEncryptionKey('abc')).toEqual(
      deriveCalendarEncryptionKey('abc'),
    );
  });
});
