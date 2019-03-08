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
    hash.create.withArgs('stub["anotherarg"]').returns('hashed2');
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
        }, Error, 'Can only wrap a function, received nothing');
      });

      it('only takes a function as the first argument', () => {
        assert.throw(() => {
          ceych.wrap(1);
        }, Error, 'Can only wrap a function, received [1]');
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

  describe('.invalidate', () => {
    it('invalidates the cache entry', (done) => {
      const func = ceych.wrap(wrappable);

      func((err, result) => {
        assert.ifError(err);
        assert.equal(result, 1);
        sinon.assert.calledOnce(wrappable);

        // Invalidate the cache entry
        ceych.invalidate(wrappable, (err) => {
          assert.ifError(err);

          // Call function again
          func((err, result) => {
            assert.ifError(err);
            assert.equal(result, 1);
            // Assert that it's been called again
            sinon.assert.calledTwice(wrappable);
            done();
          });
        });
      });
    });

    it('supports a custom ttl and suffix', (done) => {
      const func = ceych.wrap(wrappable, 20, 'saywat');

      func((err, result) => {
        assert.ifError(err);
        assert.equal(result, 1);
        sinon.assert.calledOnce(wrappable);

        // Invalidate the cache entry
        ceych.invalidate(wrappable, (err) => {
          assert.ifError(err);

          // Call function again
          func((err, result) => {
            assert.ifError(err);
            assert.equal(result, 1);

            // Assert that it's been called again
            sinon.assert.calledTwice(wrappable);
            done();
          });
        });
      });
    });

    it('does not affect other cache keys of the same function', (done) => {
      const func = ceych.wrap(wrappable);

      // Call function with another set of args
      func(1, 2, 3, (err, result) => {
        assert.ifError(err);
        assert.equal(result, 1);
        sinon.assert.calledOnce(wrappable);

        // Call function with another set of args
        func('anotherarg', (err, result) => {
          assert.ifError(err);
          assert.equal(result, 1);

          // Assert that this resulted in a second actual call
          sinon.assert.calledTwice(wrappable);
          sinon.assert.calledWith(wrappable.secondCall, 'anotherarg');
          
          // Invalidate the cache entry with the first arguments only
          ceych.invalidate(wrappable, 1, 2, 3, (err) => {
            assert.ifError(err);
            // Call function with the second set of args and do not expect another actual call
            func('anotherarg', (err, result) => {
              assert.ifError(err);
              assert.equal(result, 1);

              sinon.assert.calledTwice(wrappable);
              sinon.assert.calledWith(wrappable.secondCall, 'anotherarg');

              // Call function with the first set of args and expect another actual call
              func(1, 2, 3, (err, result) => {
                assert.ifError(err);
                assert.equal(result, 1);
                sinon.assert.calledThrice(wrappable);
                sinon.assert.calledWith(wrappable.thirdCall, 1, 2, 3);
                done();
              });
            });
          });
        });
      });
    });

  });
});
