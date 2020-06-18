'use strict';

const _ = require('lodash');
const hash = require('./hash');
const packageVersion = require('../package').version;

function createKey(func, args, suffix) {
  let keyString = func.toString().concat(JSON.stringify(args));
  if (suffix.length) {
    keyString += suffix;
  }
  return hash.create(keyString);
}

function createCacheKey(fn, args, suffix) {
  try {
    return {
      id: createKey(fn, args, suffix),
      segment: `ceych_${packageVersion}`
    };
  } catch (e) {
    const err = new Error(`Failed to create cache key from arguments: ${e.message}`);
    throw err;
  }
}

module.exports = (cacheClient, cacheOpts, fn) => {
  const statsClient = cacheOpts.statsClient;

  async function setInCache(key, value, ttl) {
    try {
      await cacheClient.set(key, value, ttl * 1000);
      return value;
    } catch (err) {
      statsClient ? statsClient.increment('ceych.errors') : _.noop();
      throw err;
    }
  }

  return async function () {
    const { ttl, suffix, statsClient } = cacheOpts;
    const args = Array.from(arguments);

    if (!cacheClient.isReady()) {
      return fn.apply(null, args);
    }

    const cacheKey = createCacheKey(fn, args, suffix);
    try {
      const reply = await cacheClient.get(cacheKey);
      if (reply) {
        statsClient ? statsClient.increment('ceych.hits') : _.noop();
        return reply.item;
      }
      statsClient ? statsClient.increment('ceych.misses') : _.noop();
      const results = await fn.apply(null, args);
      return await setInCache(cacheKey, results, ttl);

    } catch (err) {
      statsClient ? statsClient.increment('ceych.errors') : _.noop();
      throw err;
    }
  };
};
