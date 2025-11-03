export const serializeBigInt = (value: bigint | null | undefined): string | null =>
  value === undefined || value === null ? null : value.toString();

export const serializeBigIntRequired = (value: bigint): string => value.toString();

export const toBigInt = (value: bigint | number | string | null | undefined): bigint | null => {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === 'bigint') {
    return value;
  }

  return BigInt(value);
};

export const serializeBigIntArray = (values: readonly bigint[]): string[] =>
  values.map((value) => serializeBigIntRequired(value));

export const toBigIntArray = (
  values: readonly (bigint | number | string | null | undefined)[],
): bigint[] => {
  const result: bigint[] = [];
  for (const value of values) {
    const bigintValue = toBigInt(value);
    if (bigintValue !== null) {
      result.push(bigintValue);
    }
  }
  return result;
};
