'use strict';

const _ = require('lodash');
const hash = require('./hash');
const packageVersion = require('../package').version;
const Promise = require('bluebird');

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

module.exports = (cacheClient, cacheOpts, func) => {
  return function () {
    const ttl = cacheOpts.ttl;
    const suffix = cacheOpts.suffix;
    const statsClient = cacheOpts.statsClient;
    const args = Array.from(arguments);
    const callback = getFunctionCallback(args);

    let keyString;
    try {
      keyString = createKey(func, args, suffix);
    } catch (e) {
      return Promise
        .reject(new Error(`Failed to create cache key from arguments: ${e.message}`))
        .asCallback(callback);
    }

    const key = {
      id: keyString,
      segment: `ceych_${packageVersion}`
    };

    if (!cacheClient.isReady()) {
      return Promise.resolve().asCallback(callback);
    }

    const reply = cacheClient.getAsync(key)
      .catch((err) => Promise.reject(err))
      .then((cached) => {
        if (cached) {
          statsClient ? statsClient.increment('ceych.hits') : _.noop();
          return Promise.resolve(cached.item);
        }
        statsClient ? statsClient.increment('ceych.misses') : _.noop();
        if (callback) {
          func = Promise.promisify(func, {
            multiArgs: true
          });
        }
        return func.apply(null, args)
          .then((returnValues) => {
            const args = [null].concat(returnValues);
            return cacheClient.setAsync(key, args, ttl * 1000).then(() => returnValues);
          });
      });

    if (callback) {
      reply.asCallback((err, args) => {
        if (err) return callback(err);
        callback.apply(null, [null].concat(args));
      });
    }
    return reply;
  };
};
