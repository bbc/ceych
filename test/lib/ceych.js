'use strict';

const assert = require('chai').assert;
const Catbox = require('catbox').Client;
const sinon = require('sinon');
const Memory = require('catbox-memory');
const promisifyAll = require('../../lib/promiseUtils').promisifyAll;

const hash = require('../../lib/hash');
const Ceych = require('../../lib/ceych');

const sandbox = sinon.createSandbox();

describe('ceych', () => {
  let ceych;
  const wrappable = sandbox.stub().returns(Promise.resolve(1));
  const cacheClient = promisifyAll(new Catbox(new Memory()));
  const wrappableWithCb = sandbox.stub().yields(null, 1);

  beforeEach(() => {
    sandbox.stub(hash, 'create').returns('hashed');

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
        }, Error, 'Can only wrap a function, received nothing');
      });

      it('only takes a function as the first argument', () => {
        assert.throw(() => {
          ceych.wrap(1);
        }, Error, 'Can only wrap a function, received [1]');
      });

      it('sets the TTL if the second argument is an integer', () => {
        sandbox.stub(cacheClient, 'setAsync').returns(Promise.resolve());
        sandbox.stub(cacheClient, 'isReady').returns(true);

        const func = ceych.wrap(wrappable, 5);

        return func()
          .catch(assert.ifError)
          .then(() => {
            sinon.assert.calledWith(cacheClient.setAsync, sinon.match.any, sinon.match.any, 5000);
          });
      });

      it('sets the suffix if the third argument is a string', () => {
        sandbox.stub(cacheClient, 'setAsync').returns(Promise.resolve());
        const func = ceych.wrap(wrappable, 5, 'suffix');

        return func()
          .catch(assert.ifError)
          .then(() => {
            sinon.assert.calledWith(cacheClient.setAsync, sinon.match({
              id: 'hashed'
            }));
          });
      });

      it('uses the defaultTTL if the suffix is passed in as the second argument', () => {
        sandbox.stub(cacheClient, 'setAsync').returns(Promise.resolve());
        const func = ceych.wrap(wrappable, 'suffix');

        func()
          .catch(assert.ifError)
          .then(() => {
            sinon.assert.calledWith(cacheClient.setAsync, sinon.match({
              id: 'hashed'
            }), sinon.match.any, 30000);
          });
      });

      it('supports callbacks', (done) => {
        const cachedValue = Promise.resolve({
          item: 1
        });
        sandbox.stub(cacheClient, 'getAsync').returns(cachedValue);
        const func = ceych.wrap(wrappableWithCb);

        func((err, result) => {
          assert.ifError(err);
          assert.equal(result, 1);
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

        const func = ceychWithStats.wrap(wrappableWithCb);

        func((err) => {
          assert.ifError(err);
          sinon.assert.calledWith(statsClient.increment, 'ceych.misses');
          done();
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
