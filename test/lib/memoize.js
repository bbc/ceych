'use strict';

const _ = require('lodash');
const assert = require('chai').assert;
const sinon = require('sinon');
const sandbox = sinon.sandbox.create();

const hash = require('../../lib/hash');
const memoize = require('../../lib/memoize');
const packageVersion = require('../../package.json').version;

const wrappable = (cb) => cb(null, 1);
const opts = {
  ttl: 30,
  suffix: ''
};

function Circular() {
  this.circular = this;
}

describe('memoize', () => {
  let cacheClient;

  beforeEach(() => {
    cacheClient = {
      set: sandbox.stub().yields(),
      get: sandbox.stub().yields(),
      isReady: sandbox.stub().returns(true)
    };
    sandbox.stub(hash, 'create').returns('hashed');
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('hashing', () => {
    it('hashes the function as a string when there are no arguments', (done) => {
      const func = memoize(cacheClient, opts, wrappable);

      func((err) => {
        assert.ifError(err);
        sinon.assert.calledWith(hash.create, `${wrappable.toString()}[]`);
        done();
      });
    });

    it('hashes the function as a string along with its arguments', (done) => {
      const wrappableMultipleArgs = (one, two, three, four, cb) => {
        return cb(null, 1);
      };
      const func = memoize(cacheClient, opts, wrappableMultipleArgs);

      func(1, 2, 3, 4, (err) => {
        assert.ifError(err);
        sinon.assert.calledWith(hash.create, `${wrappableMultipleArgs.toString()}[1,2,3,4]`);
        done();
      });
    });

    it('hashes the function as a string along with its arguments and a suffix', (done) => {
      const differentOpts = _.cloneDeep(opts);
      differentOpts.suffix = 'some differentiating suffix';

      const wrappableMultipleArgs = (one, two, three, four, cb) => {
        return cb(null, 1);
      };
      const func = memoize(cacheClient, differentOpts, wrappableMultipleArgs);

      func(1, 2, 3, 4, (err) => {
        assert.ifError(err);
        sinon.assert.calledWith(hash.create, `${wrappableMultipleArgs.toString()}[1,2,3,4]some differentiating suffix`);
        done();
      });
    });

    it('stringifies objects before hashing', (done) => {
      const wrappableWithObject = (obj, cb) => {
        return cb(null, obj);
      };
      const func = memoize(cacheClient, opts, wrappableWithObject);

      func({
        testing: '123'
      }, (err) => {
        assert.ifError(err);
        sinon.assert.calledWith(hash.create, `${wrappableWithObject.toString()}[{"testing":"123"}]`);
        done();
      });
    });
  });

  describe('caching', () => {
    describe('retrieving from cache', () => {
      it('returns the result from the cache if one exists', (done) => {
        cacheClient.get.withArgs(sinon.match({
          id: 'hashed'
        })).yields(null, {
          item: [null, 1]
        });

        const func = memoize(cacheClient, opts, wrappable);

        func((err, results) => {
          assert.ifError(err);
          assert.strictEqual(results, 1);
          done();
        });
      });

      it('does not call the wrapped function if there is a result in the cache', (done) => {
        cacheClient.get.withArgs(sinon.match({
          id: 'hashed'
        })).yields(null, {
          item: [null, 1]
        });

        const wrappableStub = sandbox.stub().yields(null, 1);
        const func = memoize(cacheClient, opts, wrappableStub);

        func((err) => {
          assert.ifError(err);
          sinon.assert.notCalled(wrappableStub);
          done();
        });
      });

      it('returns a null value if it exists in the cache', (done) => {
        cacheClient.get.withArgs(sinon.match({
          id: 'hashed'
        })).yields(null, {
          item: [null, null]
        });

        const wrappableStub = sandbox.stub().yields();
        const func = memoize(cacheClient, opts, wrappableStub);

        func((err, results) => {
          assert.ifError(err);
          sinon.assert.notCalled(wrappableStub);
          assert.strictEqual(results, null);
          done();
        });
      });

      it('does not attempt to retrieve from the cache if the cache is not ready', (done) => {
        cacheClient.isReady.returns(false);

        const wrappableStub = sandbox.stub().yields();
        const func = memoize(cacheClient, opts, wrappableStub);

        func((err) => {
          assert.ifError(err);
          sinon.assert.notCalled(cacheClient.get);
          done();
        });
      });

      it('returns an error to the callback if retrieving from the cache fails', (done) => {
        const func = memoize(cacheClient, opts, wrappable);
        cacheClient.get.yields(new Error('GET Error!'));

        func((err) => {
          assert.ok(err);
          assert.strictEqual(err.message, 'GET Error!');
          done();
        });
      });
    });

    describe('calling wrapped function', () => {
      it('calls the wrapped function when the cache does not return anything', (done) => {
        const wrappableStub = sandbox.stub().yields(null, 1);
        const func = memoize(cacheClient, opts, wrappableStub);

        func((err, results) => {
          assert.ifError(err);
          sinon.assert.called(wrappableStub);
          assert.strictEqual(results, 1);
          done();
        });
      });

      it('calls the wrapped function with its arguments when the cache does not return anything', (done) => {
        const wrappableStub = sandbox.stub().yields(null, 1);
        const func = memoize(cacheClient, opts, wrappableStub);

        func(1, {
          two: 'three'
        }, [4], 'five', (err) => {
          assert.ifError(err);
          sinon.assert.calledWith(wrappableStub, 1, sinon.match({
            two: 'three'
          }), [4], 'five', sinon.match.func);
          done();
        });
      });

      it('supports multiple return values', (done) => {
        const wrappableStub = sandbox.stub().yields(null, 1, 2, 3);
        const func = memoize(cacheClient, opts, wrappableStub);

        func((err, resultOne, resultTwo, resultThree) => {
          assert.ifError(err);
          assert.equal(resultOne, 1);
          assert.equal(resultTwo, 2);
          assert.equal(resultThree, 3);
          done();
        });
      });

      it('returns an error to the callback if the wrapped function throws an error', (done) => {
        const wrappableStub = sandbox.stub().yields(new Error('Function Error!'));
        const func = memoize(cacheClient, opts, wrappableStub);

        func((err) => {
          assert.ok(err);
          sinon.assert.called(wrappableStub);
          assert.strictEqual(err.message, 'Function Error!');
          done();
        });
      });
    });

    describe('saving to cache', () => {
      beforeEach(() => {
        cacheClient.get.yields(null, null);
      });

      it('sets the results of the function in the cache', (done) => {
        const wrappableStub = sandbox.stub().yields(null, 1);
        const func = memoize(cacheClient, opts, wrappableStub);

        func((err) => {
          assert.ifError(err);
          sinon.assert.calledWith(cacheClient.set, sinon.match({
            id: 'hashed'
          }), [null, 1]);
          done();
        });
      });

      it('sets a return value of null to the cache', (done) => {
        const wrappableStub = sandbox.stub().yields(null, null);
        const func = memoize(cacheClient, opts, wrappableStub);

        func((err) => {
          assert.ifError(err);
          sinon.assert.calledWith(cacheClient.set, sinon.match({
            id: 'hashed'
          }), [null, null]);
          done();
        });
      });

      it('sets the TTL as the expiry in milliseconds', (done) => {
        const differentOpts = _.cloneDeep(opts);
        differentOpts.ttl = 10;

        const wrappableStub = sandbox.stub().yields(null, 1);
        const func = memoize(cacheClient, differentOpts, wrappableStub);

        func((err) => {
          assert.ifError(err);
          sinon.assert.calledWith(cacheClient.set, sinon.match({
            id: 'hashed'
          }), [null, 1], 10000);
          done();
        });
      });

      it('includes the package version in the key object', (done) => {
        const wrappableStub = sandbox.stub().yields(null, 1);
        const func = memoize(cacheClient, opts, wrappableStub);

        func((err) => {
          assert.ifError(err);
          sinon.assert.calledWith(cacheClient.set, sinon.match({
            segment: `ceych_${packageVersion}`
          }), [null, 1]);
          done();
        });
      });

      it('does not attempt to set to the cache if the cache is not ready', (done) => {
        cacheClient.isReady.returns(false);

        const wrappableStub = sandbox.stub().yields(null, 1);
        const func = memoize(cacheClient, opts, wrappableStub);

        func((err) => {
          assert.ifError(err);
          sinon.assert.notCalled(cacheClient.set);
          done();
        });
      });

      it('returns an error to the callback if saving to the cache fails', (done) => {
        cacheClient.set.yields(new Error('SET Error!'));
        const func = memoize(cacheClient, opts, wrappable);

        func((err) => {
          assert.ok(err);
          assert.strictEqual(err.message, 'SET Error!');
          done();
        });
      });
    });
  });

  describe('wrapped function parameters', () => {
    it('returns an error when one of the arguments cannot be stringified', (done) => {
      const func = memoize(cacheClient, opts, wrappable);

      func(new Circular(), (err) => {
        assert.ok(err);
        assert.strictEqual(err.message, 'Failed to create cache key from arguments: Converting circular structure to JSON');
        done();
      });
    });

    it('throws an error if a callback is not passed as an argument', () => {
      const func = memoize(cacheClient, opts, wrappable);
      assert.throw(func, Error, 'Wrapped function must be passed a callback');
    });

    it('throws an error if the final argument is not a function', () => {
      const func = memoize(cacheClient, opts, wrappable);
      assert.throw(() => {
        func(1, 2, 3);
      }, Error, 'Final argument of wrapped function must be a callback');
    });
  });

  describe('stats', () => {
    let statsClient;
    let optsWithStats;

    beforeEach(() => {
      statsClient = {
        increment: sandbox.stub()
      };

      optsWithStats = _.cloneDeep(opts);
      optsWithStats.statsClient = statsClient;
    });

    it('increments a StatsD counter every time there is a cache miss', (done) => {
      const func = memoize(cacheClient, optsWithStats, wrappable);

      func((err) => {
        assert.ifError(err);
        sinon.assert.calledWith(statsClient.increment, 'ceych.misses');
        done();
      });
    });

    it('increments a StatsD counter every time there is a cache hit', (done) => {
      cacheClient.get.yields(null, [null, 1]);
      const func = memoize(cacheClient, optsWithStats, wrappable);

      func((err) => {
        assert.ifError(err);
        sinon.assert.calledWith(statsClient.increment, 'ceych.hits');
        done();
      });
    });
  });
});
