import { parseExactVndAmount } from './sepay-vnd-amount.js';

describe('parseExactVndAmount', () => {
  it.each([
    ['250000', 250_000n],
    ['250000.00', 250_000n],
    ['000250000.000', 250_000n],
    ['0', 0n],
  ])('normalizes %s exactly', (input, expected) => {
    expect(parseExactVndAmount(input)).toBe(expected);
  });

  it.each([
    '250000.50',
    'abc',
    '-250000',
    '+250000',
    '2.5e5',
    ' 250000',
    '250000 ',
    '',
    '250000.',
  ])('rejects invalid VND amount %j', (input) => {
    expect(() => parseExactVndAmount(input)).toThrow(RangeError);
  });
});
