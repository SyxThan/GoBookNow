const VND_DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/;

export function parseExactVndAmount(value: string): bigint {
  if (!VND_DECIMAL_PATTERN.test(value)) {
    throw new RangeError('Invalid VND amount');
  }

  const [integer, fraction] = value.split('.');
  if (fraction !== undefined && !/^0+$/.test(fraction)) {
    throw new RangeError('VND amount must not contain a fractional value');
  }

  return BigInt(integer!);
}
