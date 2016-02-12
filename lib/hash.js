'use strict';

const crypto = require('crypto');

module.exports.create = function(string) {
  return crypto.createHash('sha256').update(string).digest('hex');
};
