'use strict';

const _ = require('lodash');
const Catbox = require('catbox').Client;
const Memory = require('catbox-memory');
const memoize = require('./memoize');
const promisifyAll = require('./promiseUtils').promisifyAll;

function createDefaultCacheClient() {
  return new Catbox(new Memory());
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

  if (!opts.hasOwnProperty('defaultTTL')) {
    opts.defaultTTL = 30;
  }

  if (opts.defaultTTL <= 0) {
    throw new Error('Default TTL cannot be less than or equal to zero');
  }

  opts.cacheClient = promisifyAll(opts.cacheClient);
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
    opts.cacheClient.start(_.noop);

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

  disableCache() {
    this.cache.stop();
  }
}

module.exports = Ceych;
