import test from "node:test";
import assert from "node:assert/strict";

import {
  BEST_RECORD_STORAGE_KEY,
  createBestRecordStore,
  isBetterRecord,
  sanitizeBestRecord,
} from "../src/record-store.js";

function memoryStorage(initialValue = null) {
  const values = new Map();
  if (initialValue !== null) {
    values.set(BEST_RECORD_STORAGE_KEY, initialValue);
  }
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test("최고 기록은 높이를 먼저 비교하고 같은 높이일 때 통과 칸을 비교한다", () => {
  const best = { height: 80, walkedSlots: 31 };
  assert.equal(isBetterRecord({ height: 81, walkedSlots: 1 }, best), true);
  assert.equal(isBetterRecord({ height: 80, walkedSlots: 32 }, best), true);
  assert.equal(isBetterRecord({ height: 80, walkedSlots: 31 }, best), false);
  assert.equal(isBetterRecord({ height: 79, walkedSlots: 999 }, best), false);
});

test("유효한 기록을 저장하고 새 store에서 다시 불러온다", () => {
  const storage = memoryStorage();
  const firstStore = createBestRecordStore(storage);
  assert.equal(firstStore.save({ height: 125, walkedSlots: 47 }), true);

  const reloadedStore = createBestRecordStore(storage);
  assert.deepEqual(reloadedStore.load(), {
    record: { height: 125, walkedSlots: 47 },
    failed: false,
  });
});

test("손상·음수·소수·숫자가 아닌 기록은 0 기록으로 정리한다", () => {
  const invalidValues = [
    "not-json",
    JSON.stringify({ height: "20", walkedSlots: 4 }),
    JSON.stringify({ height: -1, walkedSlots: 4 }),
    JSON.stringify({ height: 3.5, walkedSlots: 4 }),
  ];

  for (const value of invalidValues) {
    const storage = memoryStorage(value);
    const result = createBestRecordStore(storage).load();
    assert.deepEqual(result.record, { height: 0, walkedSlots: 0 });
    assert.equal(storage.values.has(BEST_RECORD_STORAGE_KEY), false);
  }
  assert.deepEqual(sanitizeBestRecord(null), { height: 0, walkedSlots: 0 });
});

test("읽기·쓰기·초기화 저장 실패는 예외나 세부 값을 출력하지 않고 실패 상태만 반환한다", () => {
  const originalConsoleError = console.error;
  const originalConsoleLog = console.log;
  const consoleCalls = [];
  console.error = (...args) => consoleCalls.push(args);
  console.log = (...args) => consoleCalls.push(args);
  try {
    const blockedStorage = {
      getItem: () => {
        throw new Error("private storage detail");
      },
      setItem: () => {
        throw new Error("private value detail");
      },
      removeItem: () => {
        throw new Error("private remove detail");
      },
    };
    const store = createBestRecordStore(blockedStorage);
    assert.deepEqual(store.load(), { record: { height: 0, walkedSlots: 0 }, failed: true });
    assert.equal(store.save({ height: 777, walkedSlots: 888 }), false);
    assert.equal(store.clear(), false);
    assert.deepEqual(consoleCalls, []);
  } finally {
    console.error = originalConsoleError;
    console.log = originalConsoleLog;
  }
});

test("손상된 값을 읽은 뒤 삭제만 실패해도 예외 없이 0 기록과 실패 상태를 반환한다", () => {
  const storage = {
    getItem: () => JSON.stringify({ height: "20", walkedSlots: 4 }),
    removeItem: () => {
      throw new Error("blocked cleanup detail");
    },
  };

  assert.deepEqual(createBestRecordStore(storage).load(), {
    record: { height: 0, walkedSlots: 0 },
    failed: true,
  });
});
