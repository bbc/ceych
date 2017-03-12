'use strict';

const assert = require('chai').assert;
const hash = require('../../lib/hash');
const Catbox = require('catbox').Client;
const sinon = require('sinon');
const sandbox = sinon.sandbox.create();
const Memory = require('catbox-memory');

const Ceych = require('../../lib/ceych');

describe('ceych', () => {
  let ceych;
  let wrappable;
  let cacheClient;

  beforeEach(() => {
    sandbox.stub(hash, 'create').returns('hashed');
    cacheClient = new Catbox(new Memory());
    wrappable = sandbox.stub().yields(null, 1);

    ceych = new Ceych({
      cacheClient: cacheClient
    });
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('does not error if cache client fails', () => {
    sandbox.stub(cacheClient, 'start').yields(new Error('DB connection failure'));

    new Ceych({
      cacheClient: cacheClient
    });
  });

  describe('validation', () => {
    it('defaults to a Catbox Memory cache client', () => {
      const ceych = new Ceych();
      assert.strictEqual(ceych.cache instanceof Catbox, true);
      assert.strictEqual(ceych.cache.connection instanceof Memory, true);
    });

    it('defaults to a TTL of 30 seconds', () => {
      const ceych = new Ceych();
      assert.strictEqual(ceych.defaultTTL, 30);
    });

    it('throws an error when the default TTL < 0', () => {
      assert.throws(() => {
        new Ceych({
          defaultTTL: -5
        });
      }, Error, 'Default TTL cannot be less than or equal to zero');
    });

    it('throws an error when the default TTL === 0', () => {
      assert.throws(() => {
        new Ceych({
          defaultTTL: 0
        });
      }, Error, 'Default TTL cannot be less than or equal to zero');
    });
  });

  describe('.wrap', () => {
    describe('parameters', () => {
      it('must have at least 1 argument', () => {
        assert.throw(() => {
          ceych.wrap();
        }, Error, 'Can only wrap a function or a promise, received nothing');
      });

      it('only takes a function as the first argument', () => {
        assert.throw(() => {
          ceych.wrap(1);
        }, Error, 'Can only wrap a function or a promise, received [1]');
      });

      it('sets the TTL if the second argument is an integer', (done) => {
        sandbox.stub(cacheClient, 'set').yields();
        sandbox.stub(cacheClient, 'isReady').returns(true);

        const func = ceych.wrap(wrappable, 5);

        func((err) => {
          assert.ifError(err);
          sinon.assert.calledWith(cacheClient.set, sinon.match.any, sinon.match.any, 5000);
          done();
        });
      });

      it('sets the suffix if the third argument is a string', (done) => {
        sandbox.stub(cacheClient, 'set').yields();
        const func = ceych.wrap(wrappable, 5, 'suffix');

        func((err) => {
          assert.ifError(err);
          sinon.assert.calledWith(cacheClient.set, sinon.match({
            id: 'hashed'
          }));
          done();
        });
      });

      it('uses the defaultTTL if the suffix is passed in as the second argument', (done) => {
        sandbox.stub(cacheClient, 'set').yields();
        const func = ceych.wrap(wrappable, 'suffix');

        func((err) => {
          assert.ifError(err);
          sinon.assert.calledWith(cacheClient.set, sinon.match({
            id: 'hashed'
          }), sinon.match.any, 30000);
          done();
        });
      });

      it('returns a function that supports sending metrics to StatsD', (done) => {
        const statsClient = {
          increment: sandbox.stub()
        };

        const ceychWithStats = new Ceych({
          cacheClient: cacheClient,
          statsClient: statsClient
        });

        const func = ceychWithStats.wrap(wrappable);

        func((err) => {
          assert.ifError(err);
          sinon.assert.calledWith(statsClient.increment, 'ceych.misses');
          done();
        });
      });
    });

    describe('Callbacks', () => {
      it('returns a function that accepts a callback', (done) => {
        const wrappableStub = sandbox.stub().yields(null, 1, 2, 3);
        const func = ceych.wrap(wrappableStub);

        func((err, one, two, three) => {
          assert.ifError(err);
          assert.strictEqual(one, 1);
          assert.strictEqual(two, 2);
          assert.strictEqual(three, 3);
          done();
        });
      });

      it('it returns an error object as the first parameter to the callback', (done) => {
        const expectedError = new Error('You never called me back');
        const wrappableStub = sandbox.stub().yields(expectedError);
        const func = ceych.wrap(wrappableStub);

        func((err) => {
          assert.deepEqual(err, err);
          done();
        }).catch(() => {

        });
      });
    });

    describe('Promises', () => {
      it('returns a promisified function', () => {
        const wrappableStub = sandbox.stub().yields(null, 1, 2, 3);
        const func = ceych.wrap(wrappableStub);

        return func()
          .then((results) => {
            assert.deepEqual(results, [1, 2, 3]);
          }).catch((err) => {
            assert.ifError(err);
          });
      });

      it('accepts a promisified function to wrap', () => {
        const wrappableStub = new Promise((resolve) => {
          resolve([1, 2, 3]);
        });

        const func = ceych.wrap(wrappableStub);

        return func()
          .then((results) => {
            assert.deepEqual(results, [1, 2, 3]);
          }).catch((err) => {
            assert.ifError(err);
          });
      });

      it('handles errors from callback functions correctly', () => {
        const expectedErr = new Error('Broken promises');
        const wrappableStub = sandbox.stub().yields(expectedErr);
        const func = ceych.wrap(wrappableStub);

        return func()
          .then(() => {
            throw new Error('Promise should not have been resolved');
          }).catch((err) => {
            assert.deepEqual(err, expectedErr);
          });
      });

      it('handles errors from promises correctly', () => {
        const expectedError = new Error('Broken promises');
        const wrappableStub = new Promise((resolve, reject) => {
          reject(expectedError);
        });

        const func = ceych.wrap(wrappableStub);

        return func()
          .then(() => {
            throw new Error('Promise should not have been resolved');
          }).catch((err) => {
            assert.deepEqual(err, expectedError);
          });
      });
    });

  });

  describe('.disableCache', () => {
    it('stops the current cache client', () => {
      const cacheClient = {
        start: sandbox.stub().yields(),
        stop: sandbox.stub().returns()
      };

      const ceych = new Ceych({
        cacheClient: cacheClient
      });

      ceych.disableCache();
      sinon.assert.called(cacheClient.stop);
    });
  });
});
