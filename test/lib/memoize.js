'use strict';

const _ = require('lodash');
const assert = require('chai').assert;
const sinon = require('sinon');
const sandbox = sinon.createSandbox();
const hash = require('../../lib/hash');
const memoize = require('../../lib/memoize');
const packageVersion = require('../../package.json').version;

const wrappableWithCb = (cb) => cb(null, 1);
const wrappable = () => {
  return Promise.resolve(1);
};

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
      set: sandbox.stub().returns(Promise.resolve()),
      get: sandbox.stub().returns(Promise.resolve()),
      isReady: sandbox.stub().returns(true)
    };
    sandbox.stub(hash, 'create').returns('hashed');
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('hashing', () => {
    it('hashes the function as a string when there are no arguments', async () => {
      const func = memoize(cacheClient, opts, wrappable);

      await func();
      sinon.assert.calledWith(hash.create, `${wrappable.toString()}[]`);
    });

    it('hashes the function as a string along with its arguments', async () => {
      const wrappableMultipleArgs = (one, two, three, four) => {
        return Promise.resolve(four - three - two - one + three);
      };
      const func = memoize(cacheClient, opts, wrappableMultipleArgs);

      await func(1, 2, 3, 4);
      sinon.assert.calledWith(hash.create, `${wrappableMultipleArgs.toString()}[1,2,3,4]`);
    });

    it('hashes the function as a string along with its arguments and a suffix', async () => {
      const differentOpts = _.cloneDeep(opts);
      differentOpts.suffix = 'some differentiating suffix';

      const wrappableMultipleArgs = (one, two, three, four) => {
        return Promise.resolve(four - three - two - one + three);
      };
      const func = memoize(cacheClient, differentOpts, wrappableMultipleArgs);

      await func(1, 2, 3, 4);
      sinon.assert.calledWith(hash.create, `${wrappableMultipleArgs.toString()}[1,2,3,4]${differentOpts.suffix}`);
    });

    it('stringifies objects before hashing', async () => {
      const wrappableWithObject = (obj) => {
        return Promise.resolve(obj);
      };
      const func = memoize(cacheClient, opts, wrappableWithObject);

      await func({
        testing: '123'
      });
      sinon.assert.calledWith(hash.create, `${wrappableWithObject.toString()}[{"testing":"123"}]`);
    });
  });

  describe('caching', () => {
    describe('retrieving from cache', () => {
      it('returns the result from the cache if one exists', async () => {
        const cachedValue = Promise.resolve({
          item: 1
        });
        cacheClient.get.withArgs(sinon.match({
          id: 'hashed'
        })).returns(cachedValue);

        const func = memoize(cacheClient, opts, wrappable);

        const results = await func();
        assert.strictEqual(results, 1);
      });

      it('does not call the wrapped function if there is a result in the cache', async () => {
        cacheClient.get.withArgs(sinon.match({
          id: 'hashed'
        })).returns(Promise.resolve({
          item: 1
        }));

        const wrappableStub = sandbox.stub().returns(Promise.resolve(1));
        const func = memoize(cacheClient, opts, wrappableStub);

        await func();
        sinon.assert.notCalled(wrappableStub);
      });

      it('returns the result from the cache for callback based functions', async () => {
        const cachedValue = Promise.resolve({
          item: 1
        });
        cacheClient.get.withArgs(sinon.match({
          id: 'hashed'
        })).returns(cachedValue);

        const func = memoize(cacheClient, opts, wrappableWithCb);

        const results = await func();
        assert.strictEqual(results, 1);
      });

      it('returns a null value if it exists in the cache', async () => {
        cacheClient.get.withArgs(sinon.match({
          id: 'hashed'
        })).returns(Promise.resolve({
          item: null
        }));

        const wrappableStub = sandbox.stub().returns();
        const func = memoize(cacheClient, opts, wrappableStub);

        const results = await func();
        sinon.assert.notCalled(wrappableStub);
        assert.strictEqual(results, null);
      });

      it('does not attempt to retrieve from the cache if the cache is not ready', async () => {
        cacheClient.isReady.returns(false);

        const wrappableStub = sandbox.stub().returns();
        const func = memoize(cacheClient, opts, wrappableStub);

        await func();
        sinon.assert.notCalled(cacheClient.get);
      });

      it('calls the underlying fn if the cache is not ready', async () => {
        cacheClient.isReady.returns(false);

        const expected = 'yoyoyoyoyoyoyoyo';
        const wrappableStub = sandbox.stub().returns(expected);
        const func = memoize(cacheClient, opts, wrappableStub);

        const res = await func();
        sinon.assert.called(wrappableStub);
        assert.strictEqual(res, expected);
      });

      it('returns an error if retrieving from the cache fails', async () => {
        const func = memoize(cacheClient, opts, wrappableWithCb);
        cacheClient.get.returns(Promise.reject(new Error('GET Error!')));

        try {
          await func();
        } catch (err) {
          return assert.strictEqual(err.message, 'GET Error!');
        }
        assert.fail('Expected error to be returned!');
      });

      it('returns an error to the callback if retrieving from the cache fails', async () => {
        const func = memoize(cacheClient, opts, wrappableWithCb);
        cacheClient.get.returns(Promise.reject(new Error('GET Error!')));
        try {
          await func();

        } catch (err) {
          assert.ok(err);
          return assert.strictEqual(err.message, 'GET Error!');
        }
        assert.fail('Expected error to be returned!');
      });
    });

    describe('calling wrapped function', () => {
      it('calls the wrapped function when the cache does not return anything', async () => {
        const wrappableStub = sandbox.stub().returns(Promise.resolve(1));
        const func = memoize(cacheClient, opts, wrappableStub);

        const results = await func();
        sinon.assert.called(wrappableStub);
        assert.strictEqual(results, 1);
      });

      it('calls the wrapped function with its arguments when the cache does not return anything', async () => {
        const wrappableStub = sandbox.stub().returns(Promise.resolve(1));
        const func = memoize(cacheClient, opts, wrappableStub);


        await func(1, { two: 'three' }, [4], 'five');
        sinon.assert.calledWith(wrappableStub, 1, sinon.match({ two: 'three' }), [4], 'five');
      });

      it('supports multiple return values', async () => {
        const wrappableStub = sandbox.stub().returns(Promise.resolve([1, 2, 3]));
        const func = memoize(cacheClient, opts, wrappableStub);

        const results = await func();
        assert.equal(results[0], 1);
        assert.equal(results[1], 2);
        assert.equal(results[2], 3);
      });

      it('returns an error if the wrapped function throws an error', async () => {
        const wrappableStub = sandbox.stub().returns(Promise.reject(new Error('Function Error!')));
        const func = memoize(cacheClient, opts, wrappableStub);

        try {
          await func();
        } catch (err) {
          sinon.assert.called(wrappableStub);
          return assert.strictEqual(err.message, 'Function Error!');
        }
        assert.fail('Expected error to be returned!');
      });
    });

    describe('saving to cache', () => {
      beforeEach(() => {
        cacheClient.get.returns(Promise.resolve(null, null));
      });

      it('sets the results of the function in the cache', async () => {
        const wrappableStub = sandbox.stub().returns(Promise.resolve(1));
        const func = memoize(cacheClient, opts, wrappableStub);

        await func();
        sinon.assert.calledWith(cacheClient.set, sinon.match({
          id: 'hashed'
        }), 1);
      });

      it('sets a return value of null to the cache', async () => {
        const wrappableStub = sandbox.stub().returns(Promise.resolve(null));
        const func = memoize(cacheClient, opts, wrappableStub);

        await func();
        sinon.assert.calledWith(cacheClient.set, sinon.match({
          id: 'hashed'
        }), null);
      });

      it('sets the TTL as the expiry in milliseconds', async () => {
        const differentOpts = _.cloneDeep(opts);
        differentOpts.ttl = 10;

        const wrappableStub = sandbox.stub().returns(Promise.resolve(1));
        const func = memoize(cacheClient, differentOpts, wrappableStub);

        await func();
        sinon.assert.calledWith(cacheClient.set, sinon.match({
          id: 'hashed'
        }), 1, 10000);
      });

      it('includes the package version in the key object', async () => {
        const wrappableStub = sandbox.stub().returns(Promise.resolve(1));
        const func = memoize(cacheClient, opts, wrappableStub);

        await func();
        sinon.assert.calledWith(cacheClient.set, sinon.match({
          segment: `ceych_${packageVersion}`
        }), 1);
      });

      it('does not attempt to set to the cache if the cache is not ready', async () => {
        cacheClient.isReady.returns(false);

        const wrappableStub = sandbox.stub().returns(Promise.resolve(1));
        const func = memoize(cacheClient, opts, wrappableStub);

        const result = await func();
        sinon.assert.notCalled(cacheClient.set);
        assert.strictEqual(result, 1);
      });

      it('returns an error if saving to the cache fails', async () => {
        cacheClient.set.returns(Promise.reject(new Error('SET Error!')));
        const func = memoize(cacheClient, opts, wrappable);

        try {
          await func();
        } catch (err) {
          return assert.strictEqual(err.message, 'SET Error!');
        }
        assert.fail('Expected error to be returned!');
      });
    });
  });

  describe('wrapped function parameters', () => {
    it('returns an error when one of the arguments cannot be stringified', async () => {
      const func = memoize(cacheClient, opts, wrappable);

      try {
        await func(new Circular());
      } catch (err) {
        return assert.match(err.message, /Failed to create cache key from arguments: Converting circular structure to JSON/);
      }
      assert.fail('Expected error to be returned!');
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

    it('increments a StatsD counter every time there is a cache miss', async () => {
      const func = memoize(cacheClient, optsWithStats, wrappable);

      await func();
      sinon.assert.calledWith(statsClient.increment, 'ceych.misses');
    });

    it('increments a StatsD counter every time there is a cache hit', async () => {
      cacheClient.get.returns(Promise.resolve([null, 1]));
      const func = memoize(cacheClient, optsWithStats, wrappable);

      await func();
      sinon.assert.calledWith(statsClient.increment, 'ceych.hits');
    });

    it('increments a StatsD counter when fetching from the cache returns an error', async () => {
      cacheClient.get.returns(Promise.reject(new Error('error')));
      const func = memoize(cacheClient, optsWithStats, wrappable);

      try {
        await func();
      } catch (error) {
        assert.ok(error);
        return sinon.assert.calledWith(statsClient.increment, 'ceych.errors');
      }
      assert.fail('Expected error to be returned!');
    });

    it('increments a StatsD counter when saving to the cache returns an error', async () => {
      cacheClient.set.returns(Promise.reject(new Error('error')));
      const func = memoize(cacheClient, optsWithStats, wrappable);


      try {
        await func();
      } catch (error) {
        assert.ok(error);
        return sinon.assert.calledWith(statsClient.increment, 'ceych.errors');
      }
      assert.fail('Expected error to be returned!');
    });
  });
});
