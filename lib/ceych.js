'use strict';

const Catbox = require('@hapi/catbox').Client;
const CatboxMemory = require('@hapi/catbox-memory');
const memoize = require('./memoize');
const createCacheKey = require('./utils').createCacheKey;

function createDefaultCacheClient() {
  return new Catbox(new CatboxMemory.Engine());
}

function validateClientOpts(opts) {
  if (!opts) {
    opts = {
      cacheClient: createDefaultCacheClient(),
      defaultTTL: 30
    };
  }

  if (!opts.cacheClient) {
    opts.cacheClient = createDefaultCacheClient();
  }

  if (!opts.hasOwnProperty('defaultTTL')) {  // eslint-disable-line no-prototype-builtins
    opts.defaultTTL = 30;
  }

  if (opts.defaultTTL <= 0) {
    throw new Error('Default TTL cannot be less than or equal to zero');
  }

  return opts;
}

function validateInvalidateOpts(opts) {
  if (!opts) {
    throw new Error('Incorrect invalidate opts received, you must pass a function or options object to invalidate.');
  }

  if (typeof opts === 'function') {
    return {
      func: opts,
      suffix: ''
    };
  }

  if (!opts.func || typeof opts.func !== 'function') {
    throw new Error('Incorrect invalidate opts received, opts.func must be a function.');
  }

  if (opts.suffix && typeof opts.suffix !== 'string') {
    throw new Error('Incorrect invalidate opts received, opts.suffix must be a string.');
  }
  
  if (!opts.suffix) opts.suffix = ''

  return opts;
}

function getWrapOpts(func, ttl, suffix) {
  if (!func) {
    throw new Error('Can only wrap a function, received nothing');
  }

  if (typeof func !== 'function') {
    throw new Error(`Can only wrap a function, received [${func}]`);
  }

  if (typeof ttl !== 'number') {
    throw new Error('Incorrect wrap opts received, ttl must be a number');
  }

  if (typeof suffix !== 'string') {
    throw new Error('Incorrect wrap opts received, suffix must be a string');
  }

  return {
    ttl,
    suffix
  };
}

class Ceych {
  constructor(opts) {
    opts = validateClientOpts(opts);
    opts.cacheClient.start();

    this.defaultTTL = opts.defaultTTL;
    this.cache = opts.cacheClient;
    this.stats = opts.statsClient;
  }

  /**
   * Returns a wrapped function that implements caching.
   * 
   * @param {function} func An asynchronous function to be wrapped
   * @param {number} [ttl] Overrides the default TTL.
   * @param {string} [suffix] A string appended to cache keys to differentiate between identical functions.
   */
  wrap(func, ttl, suffix) {
    const opts = getWrapOpts(func, ttl || this.defaultTTL, suffix || '');
    if (this.stats) {
      opts.statsClient = this.stats;
    }
    return memoize(this.cache, opts, func);
  }

  /**
   * Invalidates the current cache entry for the given function and args combination. The function passed should be the unwrapped, initial function.
   * 
   * @param {function | {func: function, suffix: string}} funcOrOpts Either a function or a set of options of the format `{ func: yourFunction, suffix: 'yourSuffix' }` if you wish to include a suffix.
   * @param  {...any} args The args that you passed to the wrapped function call which initially stored the cache entry.
   */
  invalidate(funcOrOpts, ...args) {
    const opts = validateInvalidateOpts(funcOrOpts);

    const cacheKey = createCacheKey(opts.func, args.slice(1), opts.suffix);

    if (this.stats) {
      this.stats.increment("ceych.invalidate");
    }
    return this.cache.drop(cacheKey);
  }

  /**
   * Disables the use of the cache. This can be useful if you want to toggle usage of the cache for operational purposes - e.g. for operational purposes, or unit tests.
   */
  disableCache() {
    return this.cache.stop();
  }

  /**
   * Re-enables the cache client. This can be useful if you want to toggle usage of the cache for operational purposes - e.g. for operational purposes, or unit tests.
   */
  enableCache() {
    if (!this.cache.isReady()) {
      return this.cache.start();
    }
  }
}

module.exports = Ceych;
