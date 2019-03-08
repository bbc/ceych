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

function createCacheKey(func, args, suffix) {
  return {
    id: createKey(func, args, suffix),
    segment: `ceych_${packageVersion}`
  };
}

module.exports = {
  createCacheKey
};
