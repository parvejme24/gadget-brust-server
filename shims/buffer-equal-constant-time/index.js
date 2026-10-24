'use strict';
// Drop-in replacement for buffer-equal-constant-time, which crashes on
// Node.js >= 25 because buffer.SlowBuffer was removed.
var crypto = require('crypto');
var Buffer = require('buffer').Buffer;

function bufferEq(a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) return false;
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

bufferEq.install = function () {
  Buffer.prototype.equal = function equal(that) {
    return bufferEq(this, that);
  };
};

bufferEq.restore = function () {};

module.exports = bufferEq;
