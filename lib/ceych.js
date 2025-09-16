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

function getWrapOpts(defaultTTL, args) {
  let ttl = defaultTTL;
  let suffix = '';

  if (!args.length) {
    throw new Error('Can only wrap a function, received nothing');
  }

  if (typeof args[0] !== 'function') {
    throw new Error(`Can only wrap a function, received [${args[0]}]`);
  }

  if (args[1] && typeof args[1] === 'number') {
    ttl = args[1];
  }

  if (args[1] && typeof args[1] === 'string') {
    suffix = args[1];
  }

  if (args[2] && typeof args[2] === 'string') {
    suffix = args[2];
  }

  return {
    ttl: ttl,
    suffix: suffix
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

  wrap(func) {
    const args = Array.from(arguments);
    const opts = getWrapOpts(this.defaultTTL, args);
    if (this.stats) {
      opts.statsClient = this.stats;
    }
    return memoize(this.cache, opts, func);
  }

  invalidate(funcOrOpts) {
    const opts = validateInvalidateOpts(funcOrOpts);

    const args = Array.from(arguments);

    const cacheKey = createCacheKey(opts.func, args.slice(1), opts.suffix);

    if (this.stats) {
      this.stats.increment("ceych.invalidate");
    }

    return this.cache.drop(cacheKey);
  }

  disableCache() {
    return this.cache.stop();
  }

  enableCache() {
    if (!this.cache.isReady()) {
      return this.cache.start();
    }
  }
}

module.exports = Ceych;
