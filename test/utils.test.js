const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizePhone, digitsOnly } = require('../src/utils/phone');
const { parseAmount, parseSendArgs } = require('../src/utils/parse');

test('normalizePhone keeps only the last 10 digits', () => {
  assert.equal(normalizePhone('+57 315 381 1758'), '3153811758');
  assert.equal(normalizePhone('3153811758'), '3153811758');
  assert.equal(digitsOnly('+57-300-111-2233'), '573001112233');
});

test('parseAmount rejects zero, negative and non-integer input', () => {
  assert.equal(parseAmount('5'), 5);
  assert.ok(Number.isNaN(parseAmount('0')));
  assert.ok(Number.isNaN(parseAmount('-3')));
  assert.ok(Number.isNaN(parseAmount('abc')));
});

test('parseAmount falls back when the value is missing', () => {
  assert.equal(parseAmount(undefined, { fallback: 1 }), 1);
  assert.ok(Number.isNaN(parseAmount(undefined)));
});

test('parseSendArgs finds an @handle target and an explicit amount', () => {
  assert.deepEqual(parseSendArgs(['5', 'tokens', 'to', '@3153811758']), {
    target: '3153811758',
    amount: 5,
  });
});

test('parseSendArgs defaults the amount to 1 when omitted', () => {
  assert.deepEqual(parseSendArgs(['tokens', 'to', '@3153811758']), {
    target: '3153811758',
    amount: 1,
  });
});

test('parseSendArgs errors when no target can be identified', () => {
  assert.equal(parseSendArgs(['tokens', 'to', 'someone']).error, 'target');
});
