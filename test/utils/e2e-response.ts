type AnyRecord = Record<string, unknown>;

const asRecord = (value: unknown): AnyRecord | undefined => {
  if (typeof value === 'object' && value !== null) {
    return value as AnyRecord;
  }

  return undefined;
};

export const unwrapListData = <T>(responseBody: unknown): T[] => {
  if (Array.isArray(responseBody)) {
    return responseBody as T[];
  }

  const wrapped = asRecord(responseBody);
  if (!wrapped) {
    return [];
  }

  const firstLevel = wrapped.data;
  if (Array.isArray(firstLevel)) {
    return firstLevel as T[];
  }

  const nested = asRecord(firstLevel);
  if (!nested) {
    return [];
  }

  const secondLevel = nested.data;
  if (Array.isArray(secondLevel)) {
    return secondLevel as T[];
  }

  return [];
};
