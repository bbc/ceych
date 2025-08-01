"use strict";

const hash = require("./hash");
const packageVersion = require("../package").version;

// Stats client was originally optional, in practice this doesn't seem to be the case
// This creates a noop stats client so we don't need to check if statsClient exists everytime we want to use it
function noOpStatsClient() {
  return {
    increment: () => {},
    timing: () => {},
  };
}

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
      segment: `ceych_${packageVersion}`,
    };
  } catch (e) {
    const err = new Error(
      `Failed to create cache key from arguments: ${e.message}`,
    );
    throw err;
  }
}

module.exports = (cacheClient, cacheOpts, fn) => {
  const stats = cacheOpts.statsClient || noOpStatsClient();

  async function setInCache(key, value, ttl) {
    try {
      const startTime = performance.now();

      await cacheClient.set(key, value, ttl * 1000);
      stats.timing("ceych.write_time", performance.now() - startTime);
      return value;
    } catch (err) {
      stats.increment("ceych.errors");

      if (err?.message?.toLowerCase() === "command timed out") {
        stats.increment("ceych.command_timed_out");
        return value;
      }

      throw err;
    }
  }

  return async function () {
    const { ttl, suffix } = cacheOpts;
    const args = Array.from(arguments);

    if (!cacheClient.isReady()) {
      return fn(...args);
    }

    const cacheKey = createCacheKey(fn, args, suffix);

    try {
      const startTime = performance.now();
      const reply = await cacheClient.get(cacheKey);
      stats.timing("ceych.read_time", performance.now() - startTime);
      if (reply) {
        stats.increment("ceych.hits");
        return reply.item;
      }
    } catch (err) {
      stats.increment("ceych.errors");

      if (err?.message?.toLowerCase() === "command timed out") {
        stats.increment("ceych.command_timed_out");
      }
      throw err;
    }

    stats.increment("ceych.misses");
    const results = await fn(...args);
    return await setInCache(cacheKey, results, ttl);
  };
};
