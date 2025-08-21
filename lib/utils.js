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
      segment: `ceych_${packageVersion}`,
    };
  } catch (e) {
    const err = new Error(
      `Failed to create cache key from arguments: ${e.message}`,
    );
    throw err;
  }
}

function getFunctionCallback(args) {
  const callback = args.pop();

  if (typeof callback !== 'function') {
    throw new Error('Final argument of wrapped function must be a callback');
  }

  return callback;
}

module.exports = {
  getFunctionCallback,
  createCacheKey
};
