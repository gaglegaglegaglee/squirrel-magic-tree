import test from "node:test";
import assert from "node:assert/strict";

import { TUTORIAL_SEEN_STORAGE_KEY, createTutorialStore } from "../src/tutorial-store.js";

test("안내 완료 여부를 저장하고 새 store에서 다시 읽는다", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const store = createTutorialStore(storage);
  assert.deepEqual(store.loadSeen(), { seen: false, failed: false });
  assert.equal(store.markSeen(), true);
  assert.equal(values.get(TUTORIAL_SEEN_STORAGE_KEY), "true");
  assert.deepEqual(createTutorialStore(storage).loadSeen(), { seen: true, failed: false });
});

test("안내 저장소가 막혀도 예외나 값을 출력하지 않고 실패 상태만 반환한다", () => {
  const calls = [];
  const originalError = console.error;
  console.error = (...args) => calls.push(args);
  try {
    const storage = {
      getItem: () => {
        throw new Error("storage read detail");
      },
      setItem: () => {
        throw new Error("storage write detail");
      },
    };
    const store = createTutorialStore(storage);
    assert.deepEqual(store.loadSeen(), { seen: false, failed: true });
    assert.equal(store.markSeen(), false);
    assert.deepEqual(calls, []);
  } finally {
    console.error = originalError;
  }
});
