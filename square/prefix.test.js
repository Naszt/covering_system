'use strict';

const assert = require('assert');
const { PrefixRectangleError, convert } = require('./prefix.js');

const options = { baseA: 2, baseB: 3, recursionDepth: 3 };

(async function run() {
  assert.deepEqual(await convert('1', options), [{ n: 0, m: 0, x: 0, y: 0 }]);
  assert.deepEqual(await convert('2(1,0)', options), [{ n: 1, m: 0, x: 0, y: 0 }]);
  assert.deepEqual(await convert('2_13_2', options), [{ n: 1, m: 1, x: 0.5, y: 2 / 3 }]);
  assert.deepEqual(await convert('2↑', options), [
    { n: 1, m: 0, x: 0, y: 0 },
    { n: 2, m: 0, x: 0.5, y: 0 },
    { n: 3, m: 0, x: 0.75, y: 0 }
  ]);
  await assert.rejects(convert('5(1,0,0,0,0)', options), PrefixRectangleError);
  await assert.rejects(convert('2(1,0)', { baseA: 2, baseB: 2 }), PrefixRectangleError);
  console.log('prefix expression to rectangles tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
