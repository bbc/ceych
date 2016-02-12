'use strict';

const Ceych = require('./lib/ceych');

module.exports.createClient = (opts) => {
  return new Ceych(opts);
};
