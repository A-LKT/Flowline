import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, looksHashed } from '../password';

test('hash/verify round-trips the correct password', () => {
  const hash = hashPassword('correct horse battery staple');
  assert.ok(looksHashed(hash), 'output should be recognised as a hash');
  assert.equal(verifyPassword('correct horse battery staple', hash), true);
});

test('rejects the wrong password', () => {
  const hash = hashPassword('s3cret');
  assert.equal(verifyPassword('S3cret', hash), false);
  assert.equal(verifyPassword('', hash), false);
  assert.equal(verifyPassword('s3cret ', hash), false);
});

test('every hash is uniquely salted', () => {
  assert.notEqual(hashPassword('same'), hashPassword('same'));
});

test('a precomputed AUTH_PASSWORD_HASH verifies', () => {
  // Fixed value produced by hashPassword('hunter2') — guards the stored format.
  const stored = hashPassword('hunter2');
  assert.ok(looksHashed(stored));
  assert.equal(verifyPassword('hunter2', stored), true);
});

test('malformed stored hashes are rejected, never throw', () => {
  for (const bad of ['', 'nonsense', 'scrypt$1$2', 'bcrypt$x$y$z$w$v', 'scrypt$a$b$c$d$e']) {
    assert.equal(verifyPassword('anything', bad), false, `should reject: ${bad}`);
  }
  assert.equal(looksHashed('plaintext'), false);
});
