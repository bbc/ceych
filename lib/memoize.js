'use strict';

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
      let startTime;
      if (statsClient) startTime = performance.now();

      await cacheClient.set(key, value, ttl * 1000);
      if (statsClient) statsClient.timing('ceych.write_time', performance.now() - startTime);
      return value;
    } catch (err) {
      if (statsClient) statsClient.increment('ceych.errors');
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
      let startTime;
      if (statsClient) startTime = performance.now();

      const reply = await cacheClient.get(cacheKey);
      if (statsClient) statsClient.timing('ceych.read_time', performance.now() - startTime);

      if (reply) {
        if (statsClient) statsClient.increment('ceych.hits');
        return reply.item;
      }

      if (statsClient) statsClient.increment('ceych.misses');
      const results = await fn.apply(null, args);
      return await setInCache(cacheKey, results, ttl);

    } catch (err) {
      if (statsClient) statsClient.increment('ceych.errors');
      throw err;
    }
  };
};
