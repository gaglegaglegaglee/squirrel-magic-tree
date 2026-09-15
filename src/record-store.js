export const BEST_RECORD_STORAGE_KEY = "pyramid-construction.best-record.v1";
export const EMPTY_BEST_RECORD = Object.freeze({ height: 0, walkedSlots: 0 });

export function sanitizeBestRecord(value) {
  if (
    !value ||
    typeof value !== "object" ||
    !Number.isInteger(value.height) ||
    !Number.isInteger(value.walkedSlots) ||
    value.height < 0 ||
    value.walkedSlots < 0
  ) {
    return { ...EMPTY_BEST_RECORD };
  }
  return { height: value.height, walkedSlots: value.walkedSlots };
}

export function isBetterRecord(candidate, currentBest) {
  const next = sanitizeBestRecord(candidate);
  const best = sanitizeBestRecord(currentBest);
  return next.height > best.height || (next.height === best.height && next.walkedSlots > best.walkedSlots);
}

export function createBestRecordStore(storage) {
  function safelyRemoveStoredRecord() {
    if (typeof storage?.removeItem !== "function") {
      return false;
    }
    try {
      storage.removeItem(BEST_RECORD_STORAGE_KEY);
      return true;
    } catch {
      return false;
    }
  }

  function load() {
    if (!storage || typeof storage.getItem !== "function") {
      return { record: { ...EMPTY_BEST_RECORD }, failed: true };
    }

    let rawValue;
    try {
      rawValue = storage.getItem(BEST_RECORD_STORAGE_KEY);
    } catch {
      return { record: { ...EMPTY_BEST_RECORD }, failed: true };
    }
    if (rawValue === null) {
      return { record: { ...EMPTY_BEST_RECORD }, failed: false };
    }

    try {
      const parsedValue = JSON.parse(rawValue);
      const record = sanitizeBestRecord(parsedValue);
      const wasSanitized = record.height !== parsedValue?.height || record.walkedSlots !== parsedValue?.walkedSlots;
      if (wasSanitized && !safelyRemoveStoredRecord()) {
        return { record, failed: true };
      }
      return { record, failed: false };
    } catch {
      const removed = safelyRemoveStoredRecord();
      return { record: { ...EMPTY_BEST_RECORD }, failed: !removed };
    }
  }

  function save(record) {
    if (!storage || typeof storage.setItem !== "function") {
      return false;
    }
    try {
      storage.setItem(BEST_RECORD_STORAGE_KEY, JSON.stringify(sanitizeBestRecord(record)));
      return true;
    } catch {
      return false;
    }
  }

  function clear() {
    return safelyRemoveStoredRecord();
  }

  return { load, save, clear };
}
