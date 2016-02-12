'use strict';

const assert = require('chai').assert;

const hash = require('../../lib/hash');

describe('hashing', () => {
  it('hashes the string', () => {
    const testString = 'this is a test string';
    const expectedSha1 = 'f6774519d1c7a3389ef327e9c04766b999db8cdfb85d1346c471ee86d65885bc';

    const hashedTestString = hash.create(testString);
    assert.strictEqual(hashedTestString, expectedSha1);
  });
});
