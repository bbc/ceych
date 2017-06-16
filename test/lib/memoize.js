'use strict';

const _ = require('lodash');
const assert = require('chai').assert;
const sinon = require('sinon');
const sandbox = sinon.sandbox.create();
const Promise = require('bluebird');
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
      setAsync: sandbox.stub().returns(Promise.resolve()),
      getAsync: sandbox.stub().returns(Promise.resolve()),
      isReady: sandbox.stub().returns(true)
    };
    sandbox.stub(hash, 'create').returns('hashed');
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('hashing', () => {
    it('hashes the function as a string when there are no arguments', () => {
      const func = memoize(cacheClient, opts, wrappable);

      func()
        .catch(assert.ifError)
        .then(() => {
          sinon.assert.calledWith(hash.create, `${wrappable.toString()}[]`);
        });
    });

    it('hashes the function as a string along with its arguments', () => {
      const wrappableMultipleArgs = (one, two, three, four) => {
        return Promise.resolve(four - three - two - one + three);
      };
      const func = memoize(cacheClient, opts, wrappableMultipleArgs);

      return func(1, 2, 3, 4)
        .catch(assert.ifError)
        .then(() => {
          sinon.assert.calledWith(hash.create, `${wrappableMultipleArgs.toString()}[1,2,3,4]`);
        });
    });

    it('hashes the function as a string along with its arguments and a suffix', () => {
      const differentOpts = _.cloneDeep(opts);
      differentOpts.suffix = 'some differentiating suffix';

      const wrappableMultipleArgs = (one, two, three, four) => {
        return Promise.resolve(four - three - two - one + three);
      };
      const func = memoize(cacheClient, differentOpts, wrappableMultipleArgs);

      func(1, 2, 3, 4)
        .catch(assert.ifError)
        .then(() => {
          sinon.assert.calledWith(hash.create, `${wrappableMultipleArgs.toString()}[1,2,3,4]${differentOpts.suffix}`);
        });
    });

    it('stringifies objects before hashing', () => {
      const wrappableWithObject = (obj) => {
        return Promise.resolve(obj);
      };
      const func = memoize(cacheClient, opts, wrappableWithObject);

      return func({
          testing: '123'
        })
        .catch(assert.ifError)
        .then(() => {
          sinon.assert.calledWith(hash.create, `${wrappableWithObject.toString()}[{"testing":"123"}]`);
        });
    });
  });

  describe('caching', () => {
    describe('retrieving from cache', () => {
      it('returns the result from the cache if one exists', () => {
        const cachedValue = Promise.resolve({
          item: 1
        });
        cacheClient.getAsync.withArgs(sinon.match({
          id: 'hashed'
        })).returns(cachedValue);

        const func = memoize(cacheClient, opts, wrappable);

        func()
          .catch(assert.ifError)
          .then((results) => {
            assert.strictEqual(results, 1);
          });
      });

      it('does not call the wrapped function if there is a result in the cache', () => {
        cacheClient.getAsync.withArgs(sinon.match({
          id: 'hashed'
        })).returns(Promise.resolve({
          item: 1
        }));

        const wrappableStub = sandbox.stub().returns(Promise.resolve(1));
        const func = memoize(cacheClient, opts, wrappableStub);

        return func()
          .catch(assert.ifError)
          .then(() => {
            sinon.assert.notCalled(wrappableStub);
          });
      });

      it('returns a null value if it exists in the cache', () => {
        cacheClient.getAsync.withArgs(sinon.match({
          id: 'hashed'
        })).returns(Promise.resolve({
          item: null
        }));

        const wrappableStub = sandbox.stub().returns();
        const func = memoize(cacheClient, opts, wrappableStub);

        return func()
          .catch(assert.ifError)
          .then((results) => {
            sinon.assert.notCalled(wrappableStub);
            assert.strictEqual(results, null);
          });
      });

      it('does not attempt to retrieve from the cache if the cache is not ready', () => {
        cacheClient.isReady.returns(false);

        const wrappableStub = sandbox.stub().returns();
        const func = memoize(cacheClient, opts, wrappableStub);

        return func()
          .catch(assert.ifError)
          .then(() => {
            sinon.assert.notCalled(cacheClient.getAsync);
          });
      });

      it('returns an error to the callback if retrieving from the cache fails', () => {
        const func = memoize(cacheClient, opts, wrappableWithCb);
        cacheClient.getAsync.returns(Promise.reject(new Error('GET Error!')));

        return func()
          .then(() => {
            assert.fail('Expected error to be returned!');
          })
          .catch((err) => {
            assert.strictEqual(err.message, 'GET Error!');
          });
      });
    });

    describe('calling wrapped function', () => {
      it('calls the wrapped function when the cache does not return anything', () => {
        const wrappableStub = sandbox.stub().returns(Promise.resolve(1));
        const func = memoize(cacheClient, opts, wrappableStub);

        return func()
          .catch(assert.ifError)
          .then((results) => {
            sinon.assert.called(wrappableStub);
            assert.strictEqual(results, 1);
          });
      });

      it('calls the wrapped function with its arguments when the cache does not return anything', () => {
        const wrappableStub = sandbox.stub().returns(Promise.resolve(1));
        const func = memoize(cacheClient, opts, wrappableStub);

        return func(1, {
            two: 'three'
          }, [4], 'five')
          .catch(assert.ifError)
          .then(() => {
            sinon.assert.calledWith(wrappableStub, 1, sinon.match({
              two: 'three'
            }), [4], 'five');
          });
      });

      it('supports multiple return values', () => {
        const wrappableStub = sandbox.stub().returns(Promise.resolve([1, 2, 3]));
        const func = memoize(cacheClient, opts, wrappableStub);

        func()
          .catch(assert.ifError)
          .then((results) => {
            assert.equal(results[0], 1);
            assert.equal(results[1], 2);
            assert.equal(results[2], 3);
          });
      });

      it('returns an error to the callback if the wrapped function throws an error', () => {
        const wrappableStub = sandbox.stub().returns(Promise.reject(new Error('Function Error!')));
        const func = memoize(cacheClient, opts, wrappableStub);

        return func()
          .catch((err) => {
            sinon.assert.called(wrappableStub);
            assert.strictEqual(err.message, 'Function Error!');
          });
      });
    });

    describe('saving to cache', () => {
      beforeEach(() => {
        cacheClient.getAsync.returns(Promise.resolve(null, null));
      });

      it('sets the results of the function in the cache', () => {
        const wrappableStub = sandbox.stub().returns(Promise.resolve(1));
        const func = memoize(cacheClient, opts, wrappableStub);

        return func()
          .catch(assert.ifError)
          .then(() => {
            sinon.assert.calledWith(cacheClient.setAsync, sinon.match({
              id: 'hashed'
            }), [null, 1]);
          });
      });

      it('sets a return value of null to the cache', () => {
        const wrappableStub = sandbox.stub().returns(Promise.resolve(null));
        const func = memoize(cacheClient, opts, wrappableStub);

        return func()
          .then(() => {
            sinon.assert.calledWith(cacheClient.setAsync, sinon.match({
              id: 'hashed'
            }), [null, null]);
          });
      });

      it('sets the TTL as the expiry in milliseconds', () => {
        const differentOpts = _.cloneDeep(opts);
        differentOpts.ttl = 10;

        const wrappableStub = sandbox.stub().returns(Promise.resolve(1));
        const func = memoize(cacheClient, differentOpts, wrappableStub);

        return func()
          .catch(assert.ifError)
          .then(() => {
            sinon.assert.calledWith(cacheClient.setAsync, sinon.match({
              id: 'hashed'
            }), [null, 1], 10000);
          });
      });

      it('includes the package version in the key object', () => {
        const wrappableStub = sandbox.stub().returns(Promise.resolve(1));
        const func = memoize(cacheClient, opts, wrappableStub);

        return func()
          .catch(assert.ifError)
          .then(() => {
            sinon.assert.calledWith(cacheClient.setAsync, sinon.match({
              segment: `ceych_${packageVersion}`
            }), [null, 1]);
          });
      });

      it('does not attempt to set to the cache if the cache is not ready', () => {
        cacheClient.isReady.returns(false);

        const wrappableStub = sandbox.stub().returns(Promise.resolve(1));
        const func = memoize(cacheClient, opts, wrappableStub);

        return func()
          .catch(assert.ifError)
          .then(() => {
            sinon.assert.notCalled(cacheClient.setAsync);
          });
      });

      it('returns an error to the callback if saving to the cache fails', () => {
        cacheClient.setAsync.returns(Promise.reject(new Error('SET Error!')));
        const func = memoize(cacheClient, opts, wrappable);

        return func()
          .catch((err) => {
            assert.strictEqual(err.message, 'SET Error!');
          });
      });
    });
  });

  describe('wrapped function parameters', () => {
    it('returns an error when one of the arguments cannot be stringified', () => {
      const func = memoize(cacheClient, opts, wrappable);

      func(new Circular())
        .catch((err) => {
          assert.strictEqual(err.message, 'Failed to create cache key from arguments: Converting circular structure to JSON');
        });
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
      const func = memoize(cacheClient, optsWithStats, wrappableWithCb);

      func((err) => {
        assert.ifError(err);
        sinon.assert.calledWith(statsClient.increment, 'ceych.misses');
        done();
      });
    });

    it('increments a StatsD counter every time there is a cache hit', (done) => {
      cacheClient.getAsync.returns(Promise.resolve([null, 1]));
      const func = memoize(cacheClient, optsWithStats, wrappableWithCb);

      func((err) => {
        assert.ifError(err);
        sinon.assert.calledWith(statsClient.increment, 'ceych.hits');
        done();
      });
    });
  });
});
