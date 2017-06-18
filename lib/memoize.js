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

module.exports = (cacheClient, cacheOpts, fn) => {
  function setInCache(key, ttl) {
    return (returnValues) => {
      return cacheClient
        .setAsync(key, returnValues, ttl * 1000)
        .then(() => returnValues);
    };
  }

  return function () {
    const ttl = cacheOpts.ttl;
    const suffix = cacheOpts.suffix;
    const statsClient = cacheOpts.statsClient;
    const args = Array.from(arguments);
    const cb = getFunctionCallback(args);

    let keyString;
    try {
      keyString = createKey(fn, args, suffix);
    } catch (e) {
      const err = new Error(`Failed to create cache key from arguments: ${e.message}`);
      return promiseUtils.asCallBack(Promise.reject(err), cb);
    }

    const key = {
      id: keyString,
      segment: `ceych_${packageVersion}`
    };

    if (!cacheClient.isReady()) {
      return promiseUtils.asCallBack(Promise.resolve(), cb);
    }

    const reply = cacheClient.getAsync(key)
      .catch((err) => Promise.reject(err))
      .then((cached) => {
        if (cached) {
          statsClient ? statsClient.increment('ceych.hits') : _.noop();
          return Promise.resolve(cached.item);
        }
        statsClient ? statsClient.increment('ceych.misses') : _.noop();
        let fnWrapper = fn;
        if (cb) {
          fnWrapper = promiseUtils.promisify(fnWrapper);
        }
        return fnWrapper.apply(null, args).then(setInCache(key, ttl));
      });

    if (cb) {
      registerCallback(reply, cb);
    }
    return reply;
  };
};
