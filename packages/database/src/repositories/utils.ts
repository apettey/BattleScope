export const serializeBigInt = (value: bigint | null | undefined): string | null =>
  value === undefined || value === null ? null : value.toString();

export const toBigInt = (value: bigint | number | string | null | undefined): bigint | null => {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === 'bigint') {
    return value;
  }

  return BigInt(value);
};
