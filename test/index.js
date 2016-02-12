'use strict';

const assert = require('chai').assert;
const Ceych = require('../');

describe('Ceych', () => {
  describe('.createClient', () => {
    it('returns a ceych client', () => {
      const testCeych = Ceych.createClient();
      assert.strictEqual(typeof testCeych, 'object');
    });
  });
});
