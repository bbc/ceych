'use strict';

const assert = require('chai').assert;
const Catbox = require('@hapi/catbox').Client;
const sinon = require('sinon');
const CatboxMemory = require('@hapi/catbox-memory');

const hash = require('../../lib/hash');
const Ceych = require('../../lib/ceych');
const { createCacheKey } = require('../../lib/utils');

const sandbox = sinon.createSandbox();

describe('ceych', () => {
  let ceych;
  let cacheClientStub;
  let cacheClient;
  let wrappable;

  beforeEach(() => {
    wrappable = sandbox.stub().returns(Promise.resolve(1));
    cacheClient = new Catbox(new CatboxMemory.Engine());
    cacheClientStub = sandbox.stub(cacheClient);
    cacheClient.isReady.returns(true);
    ceych = new Ceych({
      cacheClient: cacheClient
    });
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('does not error if cache client fails', () => {
    sandbox.stub(hash, 'create').returns('hashed');
    cacheClientStub.start.rejects(new Error('DB connection failure'));

    new Ceych({
      cacheClient: cacheClient
    });
  });

  describe('validation', () => {
    beforeEach(() => {
      sandbox.stub(hash, 'create').returns('hashed');
    });

    it('defaults to a Catbox Memory cache client', () => {
      const ceych = new Ceych();
      assert.strictEqual(ceych.cache instanceof Catbox, true);
      assert.strictEqual(ceych.cache.connection instanceof CatboxMemory.Engine, true);
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
    beforeEach(() => {
      sandbox.stub(hash, 'create').returns('hashed');
    });

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

      it('sets the TTL if the second argument is an integer', async () => {
        const func = ceych.wrap(wrappable, 5);
        await func();
        sinon.assert.calledWith(cacheClient.set, sinon.match.any, sinon.match.any, 5000);
      });

      it('sets the suffix if the third argument is a string', async () => {
        const func = ceych.wrap(wrappable, 5, 'suffix');
        await func();
        sinon.assert.calledWith(cacheClient.set, sinon.match({
          id: 'hashed'
        }));
      });

      it('throws if incorrect type supplied as ttl', async () => {
        try {
          ceych.wrap(wrappable, 'invalid_ttl');
        } catch (error) {
          assert(true);
          return;
        }

        assert(false, 'expected ceych.wrap to throw');
      });

      it('throws if incorrect type supplied as suffix', async () => {
        try {
          ceych.wrap(wrappable, 100, { badSuffix: true });
        } catch (error) {
          assert(true);
          return;
        }

        assert(false, 'expected ceych.wrap to throw');
      });

      it('returns a function that supports sending metrics to StatsD', async () => {
        const statsClient = {
          increment: sandbox.stub(),
          timing: sandbox.stub(),
        };

        const ceychWithStats = new Ceych({
          cacheClient: cacheClient,
          statsClient: statsClient
        });

        const func = ceychWithStats.wrap(wrappable);
        try {
          await func();
        } catch (err) {
          sinon.assert.calledWith(statsClient.increment, 'ceych.misses');
        }
      });
    });
  });

  describe('.invalidate', () => {
    it('invalidates the cache entry', async () => {
      cacheClient.get.onFirstCall().returns(null)
        .onSecondCall().returns({ item: 1 })
        .onThirdCall().returns(null);

      const cacheKey = createCacheKey(wrappable, [], '');
      const func = ceych.wrap(wrappable);

      await func();
      await func();
      sinon.assert.calledOnce(wrappable);
      sinon.assert.calledTwice(cacheClient.get);
      sinon.assert.alwaysCalledWith(cacheClient.get, cacheKey);

      ceych.invalidate(wrappable);
      sinon.assert.calledOnce(cacheClient.drop);

      await func();

      sinon.assert.calledThrice(cacheClient.get);
      sinon.assert.alwaysCalledWith(cacheClient.get, cacheKey);
      sinon.assert.calledTwice(wrappable);
    });

    it('supports a custom ttl and suffix', async () => {
      cacheClient.get
        .onFirstCall().returns(null)
        .onSecondCall().returns({ item: 1 })
        .onThirdCall().returns(null);

      const suffix = 'saywat';
      const cacheKey = createCacheKey(wrappable, [], suffix);
      const func = ceych.wrap(wrappable, 20, suffix);

      await func();
      await func();
      sinon.assert.calledOnce(wrappable);
      sinon.assert.calledTwice(cacheClient.get);
      sinon.assert.alwaysCalledWith(cacheClient.get, cacheKey);

      await ceych.invalidate({ func: wrappable, suffix });
      sinon.assert.calledWith(cacheClient.drop, cacheKey);

      await func();
      sinon.assert.calledTwice(wrappable);
    });

    it('does not affect other cache keys of the same function', async () => {
      cacheClient.get.onFirstCall().returns(null)
        .onSecondCall().returns(null)
        .onThirdCall().returns(null)
        .onCall(3).returns({ item: 1 });

      const helloCacheKey = createCacheKey(wrappable, ['hello'], '');
      const bonjourCacheKey = createCacheKey(wrappable, ['bonjour'], '');
      const func = ceych.wrap(wrappable);

      await func('hello');
      await func('bonjour');
      sinon.assert.calledTwice(wrappable);
      sinon.assert.calledWith(cacheClient.get, helloCacheKey);
      sinon.assert.calledWith(cacheClient.get, bonjourCacheKey);

      await ceych.invalidate(wrappable, 'hello');
      sinon.assert.calledWith(cacheClient.drop, helloCacheKey);
      sinon.assert.neverCalledWith(cacheClient.drop, bonjourCacheKey);

      await func('hello');
      await func('bonjour');

      const calls = wrappable.getCalls();
      assert.equal(2, calls.filter((c) => c.args[0] === 'hello').length);
      assert.equal(1, calls.filter((c) => c.args[0] === 'bonjour').length);
    });

    it('does not affect other cache keys of the same function, multi-argument', async () => {
      cacheClient.get.onFirstCall().returns(null)
        .onSecondCall().returns(null)
        .onThirdCall().returns(null)
        .onCall(3).returns({ item: 1 });

      const helloCacheKey = createCacheKey(wrappable, ['hello'], '');
      const helloBonjourCacheKey = createCacheKey(wrappable, ['hello', 'bonjour'], '');
      const func = ceych.wrap(wrappable);

      await func('hello');
      await func('hello', 'bonjour');
      sinon.assert.calledTwice(wrappable);
      sinon.assert.calledWith(cacheClient.get, helloCacheKey);
      sinon.assert.calledWith(cacheClient.get, helloBonjourCacheKey);

      await ceych.invalidate(wrappable, 'hello');
      sinon.assert.calledWith(cacheClient.drop, helloCacheKey);
      sinon.assert.neverCalledWith(cacheClient.drop, helloBonjourCacheKey);

      await func('hello');
      await func('hello', 'bonjour');

      const calls = wrappable.getCalls();
      assert.equal(calls.filter((c) => c.args[0] === 'hello' && c.args.length === 1).length, 2);
      assert.equal(calls.filter((c) => c.args.join(',') === 'hello,bonjour').length, 1);
    });

    it('increments a metric for invalidation', async () => {
      cacheClient.get.onFirstCall().returns(null)
        .onSecondCall().returns({ item: 1 })
        .onThirdCall().returns(null);

      const statsClient = {
        increment: sandbox.stub(),
        timing: sandbox.stub(),
      };

      const ceych = new Ceych({
        cacheClient,
        statsClient
      });

      const func = ceych.wrap(wrappable);

      await func();
      await func();

      sinon.assert.calledOnce(wrappable);

      ceych.invalidate(wrappable);
      sinon.assert.calledOnce(cacheClient.drop);
      sinon.assert.calledWithExactly(statsClient.increment, 'ceych.invalidate');

      await func();

      sinon.assert.calledTwice(wrappable);
    });
  });

  describe('.set', () => {
    it('updates the value of an existing key in the cache', async () => {
      cacheClient.get.onFirstCall().returns(null);
      cacheClient.get.onSecondCall().returns({ item: 100 });
      const cacheKey = createCacheKey(wrappable, [], '');
      const wrapped = ceych.wrap(wrappable);

      // First call: result is stored in cache
      await wrapped();

      // Manually set a new value in the cache
      ceych.set(wrappable, [], 100);

      await wrapped();

      sinon.assert.calledTwice(cacheClient.set);
      const setArgs = cacheClient.set.getCall(1).args;
      assert.strictEqual(setArgs[0].id, cacheKey.id);
      assert.strictEqual(setArgs[1], 100);

      sinon.assert.calledOnce(wrappable);
    });

    it('sets the TTL to a random value between defaultTTL and defaultTTL / 2', async () => {
      const cacheKey = createCacheKey(wrappable, [], '');
      const wrapped = ceych.wrap(wrappable);
      sinon.stub(Math, 'random').returns(1);

      ceych.set(wrappable, [], 100);

      sinon.assert.calledOnce(cacheClient.set);
      const setArgs = cacheClient.set.getCall(0).args;
      assert.strictEqual(setArgs[0].id, cacheKey.id);
      assert.strictEqual(setArgs[1], 100);
      assert.strictEqual(setArgs[2], 15000);
    });

    it('should support a suffix', async () => {
      const cacheKey = createCacheKey(wrappable, [], 'suffix');
      const wrapped = ceych.wrap(wrappable);

      ceych.set({ func: wrappable, suffix: 'suffix' }, [], 10);

      const setArgs = cacheClient.set.getCall(0).args;
      assert.strictEqual(setArgs[0].id, cacheKey.id);
      assert.strictEqual(setArgs[1], 10);
    });

    it('does not affect other cache keys of the same function', async () => {
      const frenchCacheKey = createCacheKey(wrappable, ['bonjour'], '');
      const englishCacheKey = createCacheKey(wrappable, ['hello'], '');
      const wrapped = ceych.wrap(wrappable);

      await wrapped('hello');
      await wrapped('bonjour');

      sinon.assert.calledTwice(cacheClient.set);

      ceych.set(wrappable, ['hello'], 10);

      sinon.assert.calledThrice(cacheClient.set);

      const setArgs = cacheClient.set.getCall(2).args;
      assert.strictEqual(setArgs[0].id, englishCacheKey.id);
    });

    it(`should increment a 'set' metric if a stats client has been passed in`, async () => {
      const statsClient = {
        increment: sandbox.stub(),
        timing: sandbox.stub(),
      };

      const ceych = new Ceych({
        cacheClient,
        statsClient
      });

      const func = ceych.wrap(wrappable);

      ceych.set(wrappable, [], 10);
      sinon.assert.calledWithExactly(statsClient.increment, 'ceych.set');
    });
  });

  describe('.disableCache', () => {
    beforeEach(() => {
      sandbox.stub(hash, 'create').returns('hashed');
    });

    it('stops the cache client', async () => {
      const cacheClient = {
        start: sandbox.stub().resolves(),
        stop: sandbox.stub().resolves()
      };

      const ceych = new Ceych({
        cacheClient: cacheClient
      });

      await ceych.disableCache();
      sinon.assert.called(cacheClient.stop);
    });
  });

  describe('.enableCache', () => {
    beforeEach(() => {
      sandbox.stub(hash, 'create').returns('hashed');
    });

    it('starts the cache client if it is stopped', async () => {
      cacheClient.isReady.returns(false);
      await ceych.enableCache();
      sinon.assert.called(cacheClient.start);
    });

    it('does nothing if the cache client was already started', async () => {
      cacheClient.start.resetHistory(); // start is called in the constructor, so reset its history
      await ceych.enableCache();
      sinon.assert.notCalled(cacheClient.start);
    });
  });
});
