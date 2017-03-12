'use strict';

const _ = require('lodash');
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
    throw new Error('Can only wrap a function or a promise, received nothing');
  }

  if (typeof args[0] !== 'function' && typeof args[0].then !== 'function') {
    throw new Error(`Can only wrap a function or a promise, received [${args[0]}]`);
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

function callbackify(promise) {
  return (cb) => {
    promise
      .then((data) => {
        setImmediate(cb, null, data);
      })
      .catch((err) => {
        setImmediate(cb, err);
      });
  };
}

function squashArguments(args) {
  if (args.length > 1) {
    return args;
  }
  return args[0];
}

function Ceych(opts) {
  opts = validateClientOpts(opts);

  opts.cacheClient.start(_.noop);

  this.defaultTTL = opts.defaultTTL;
  this.cache = opts.cacheClient;
  this.stats = opts.statsClient;
}

Ceych.prototype.wrap = function wrap(func, ttl, suffix) { // eslint-disable-line no-unused-vars
  const args = Array.prototype.slice.call(arguments);
  const opts = getWrapOpts(this.defaultTTL, args);

  if (Promise.resolve(func) === func) {
    func = callbackify(func);
  }

  if (this.stats) {
    opts.statsClient = this.stats;
  }

  const wrappedFn = memoize(this.cache, opts, func);

  return function () {
    const args = Array.prototype.slice.call(arguments, 0);
    let callback;

    if (typeof args[args.length - 1] === 'function') {
      callback = args.pop();
    } else {
      callback = () => { };
    }

    const handleResponse = function (err) {
      if (err) {
        callback(err);
        return this.reject(err);
      }

      callback.apply(this, arguments);

      const remainingArguments = Array.prototype.slice.call(arguments, 1);
      return this.resolve(squashArguments(remainingArguments));
    };

    return new Promise(function (resolve, reject) {
      const scope = {
        resolve: resolve,
        reject: reject
      };
      args.push(handleResponse.bind(scope));
      wrappedFn.apply(this, args);
    });
  };
};

Ceych.prototype.disableCache = function () {
  this.cache.stop();
};

module.exports = Ceych;
