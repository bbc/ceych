'use strict';

const _ = require('lodash');
const async = require('async');
const createCacheKey = require('./utils').createCacheKey;

function getFunctionArgs(_args) {
  const args = Array.prototype.slice.call(_args);

  if (!args.length) {
    throw new Error('Wrapped function must be passed a callback');
  }

  return args;
}

function getFunctionCallback(args) {
  const callback = args.pop();

  if (typeof callback !== 'function') {
    throw new Error('Final argument of wrapped function must be a callback');
  }

  return callback;
}

module.exports = function (cacheClient, cacheOpts, func) {
  return function () {
    const ttl = cacheOpts.ttl;
    const suffix = cacheOpts.suffix;
    const statsClient = cacheOpts.statsClient;
    const args = getFunctionArgs(arguments);
    const callback = getFunctionCallback(args);

    let cacheKey;

    try {
      cacheKey = createCacheKey(func, args, suffix);
    } catch (e) {
      return callback(new Error(`Failed to create cache key from arguments: ${e.message}`));
    }

    async.waterfall([
      function getFromCache(done) {
        if (!cacheClient.isReady()) {
          return done(null, null);
        }

        cacheClient.get(cacheKey, (err, cached) => {
          if (err) return done(err);

          if (cached) {
            statsClient ? statsClient.increment('ceych.hits') : _.noop();
            return done(null, cached);
          }

          statsClient ? statsClient.increment('ceych.misses') : _.noop();

          done(null, null);
        });
      },
      function applyFunction(cached, done) {
        if (cached) return done(null, cached.item, false);

        func.apply(null, args.concat(function () {
          const returnValues = Array.prototype.slice.call(arguments);
          const err = returnValues[0];

          if (err) return done(err);

          done(null, returnValues, true);
        }));
      },
      function setInCache(returnValues, setInCache, done) {
        if (!cacheClient.isReady() || !setInCache) return done.apply(null, returnValues);

        cacheClient.set(cacheKey, returnValues, ttl * 1000, (err) => {
          if (err) return done(err);

          done.apply(null, returnValues);
        });
      }
    ], callback);
  };
};
