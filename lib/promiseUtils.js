'use strict';

const bluebird = require('bluebird');

module.exports.promisify = (fn) => {
    return bluebird.promisify(fn, {
        multiArgs: true
    });
};

module.exports.asCallBack = (promise, cb) => {
    return bluebird.resolve(promise).asCallback(cb);
};
