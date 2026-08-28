'use strict';

const assert = require('assert');
const contract = require('./syntax-contract.json');
const { parse, normalize, ParseError } = require('./parser.js');

contract.valid.forEach(({ source, normalized }) => {
  assert.equal(normalize(parse(source)), normalized, source);
});

contract.invalid.forEach(({ source }) => {
  assert.throws(() => parse(source), ParseError, source);
});

assert.equal(normalize(parse('13_{3,12,0}')).startsWith('13('), true);

const latexExample = '5^\\uparrow(1,2^\\uparrow,3^\\uparrow,0)+7^\\uparrow(1,2^\\uparrow,3^\\uparrow,5^\\uparrow\\_3,5^\\uparrow\\_32^\\uparrow,5^\\uparrow\\_33^\\uparrow)';
const explicitExample = '5↑(1,2↑(1),3↑(1,2↑(1)),0)+7↑(1,2↑(1),3↑(1,2↑(1)),5↑(0,0,0,1),5↑(0,0,0,2↑(1)),5↑(0,0,0,3↑(1,2↑(1))))';
assert.equal(normalize(parse(latexExample)), explicitExample);
assert.equal(normalize(parse(latexExample)), normalize(parse(explicitExample)));

console.log(`tree parser contract passed (${contract.valid.length + contract.invalid.length} cases)`);
