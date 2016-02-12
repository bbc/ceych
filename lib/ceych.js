'use strict';

const Catbox = require('catbox').Client;
const Memory = require('catbox-memory');
const memoize = require('./memoize');

function validateClientOpts(opts) {
  if (!opts) {
    opts = {
      cacheClient: new Catbox(new Memory()),
      defaultTTL: 30
    };
  }

  if (!opts.cacheClient) {
    opts.cacheClient = new Catbox(new Memory());
  }

  if (!opts.hasOwnProperty('defaultTTL')) {
    opts.defaultTTL = 30;
  }

  if (opts.defaultTTL <= 0) {
    throw new Error('Default TTL cannot be less than or equal to zero');
  }

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

function Ceych(opts) {
  opts = validateClientOpts(opts);

  opts.cacheClient.start((err) => {
    if (err) throw new Error(`Failed to initialize cache client: ${err.message}`);
  });

  this.defaultTTL = opts.defaultTTL;
  this.cache = opts.cacheClient;
  this.stats = opts.statsClient;
}

Ceych.prototype.wrap = function wrap(func, ttl, suffix) { // eslint-disable-line no-unused-vars
  const args = Array.prototype.slice.call(arguments);
  const opts = getWrapOpts(this.defaultTTL, args);

  if (this.stats) {
    opts.statsClient = this.stats;
  }

  return memoize(this.cache, opts, func);
};

Ceych.prototype.disableCache = function() {
  this.cache.stop();
};

module.exports = Ceych;
