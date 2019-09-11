'use strict';

const _ = require('lodash');
const hash = require('./hash');
const packageVersion = require('../package').version;
const promiseUtils = require('./promiseUtils');

function createKey(func, args, suffix) {
  let keyString = func.toString().concat(JSON.stringify(args));
  if (suffix.length) {
    keyString += suffix;
  }
  return hash.create(keyString);
}

function createCacheKey(fn, args, suffix) {
  return {
    id: createKey(fn, args, suffix),
    segment: `ceych_${packageVersion}`
  };
}

function getFunctionCallback(args) {
  const cb = args[args.length - 1];
  if (typeof cb === 'function') {
    return args.pop();
  }
  return;
}

function registerCallback(promise, cb) {
  promiseUtils.asCallBack(promise, (err, args) => {
    if (err) return cb(err);
    cb.apply(null, [null].concat(args));
  });
}

function getFnWrapper(fn, cb) {
  if (cb) {
    return promiseUtils.promisify(fn);
  }
  return fn;
}

module.exports = (cacheClient, cacheOpts, fn) => {
  const statsClient = cacheOpts.statsClient;

  function setInCache(key, ttl) {
    return (returnValues) => {
      return cacheClient
        .setAsync(key, returnValues, ttl * 1000)
        .catch((err) => {
          statsClient ? statsClient.increment('ceych.errors') : _.noop();
          return Promise.reject(err);
        })
        .then(() => returnValues);
    };
  }

  return function () {
    const ttl = cacheOpts.ttl;
    const suffix = cacheOpts.suffix;
    const statsClient = cacheOpts.statsClient;
    const args = Array.from(arguments);
    const cb = getFunctionCallback(args);

    if (!cacheClient.isReady()) {
      const fnWrapper = getFnWrapper(fn, cb);
      return promiseUtils.asCallBack(fnWrapper.apply(null, args), cb);
    }

    let cacheKey;
    try {
      cacheKey = createCacheKey(fn, args, suffix);
    } catch (e) {
      const err = new Error(`Failed to create cache key from arguments: ${e.message}`);
      return promiseUtils.asCallBack(Promise.reject(err), cb);
    }

    const reply = cacheClient.getAsync(cacheKey)
      .catch((err) => {
        statsClient ? statsClient.increment('ceych.errors') : _.noop();
        return Promise.reject(err);
      })
      .then((cached) => {
        if (cached) {
          statsClient ? statsClient.increment('ceych.hits') : _.noop();
          return Promise.resolve(cached.item);
        }
        statsClient ? statsClient.increment('ceych.misses') : _.noop();
        const fnWrapper = getFnWrapper(fn, cb);
        return fnWrapper.apply(null, args).then(setInCache(cacheKey, ttl));
      });

    if (cb) {
      registerCallback(reply, cb);
    }
    return reply;
  };
};
