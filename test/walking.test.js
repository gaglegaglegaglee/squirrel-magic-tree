import test from "node:test";
import assert from "node:assert/strict";

import {
  PATH_REVIEW_SECONDS,
  SLOT_COUNT,
  WALK_STEP_SECONDS,
  advanceRock,
  advanceWalk,
  calculateAscendingRecovery,
  calculateDropDamage,
  createInitialState,
  findDangerousDrops,
  placeCurrentRock,
  startGame,
} from "../src/game-state.js";

function randomSequenceForHeights(heights) {
  let index = 0;
  return () => {
    const height = heights[Math.min(index, heights.length - 1)];
    index += 1;
    return (height - 0.5) / 50;
  };
}

function completeBoard(heights) {
  const state = createInitialState();
  const random = randomSequenceForHeights(heights);
  startGame(state, random);

  for (let slotIndex = 0; slotIndex < SLOT_COUNT; slotIndex += 1) {
    state.currentRock.position = (slotIndex + 0.51) / SLOT_COUNT;
    advanceRock(state, 0, random);
    assert.equal(placeCurrentRock(state, random), true);
  }
  return state;
}

function startWalking(state) {
  assert.equal(state.phase, "path-review");
  advanceWalk(state, PATH_REVIEW_SECONDS);
  assert.equal(state.phase, "walking");
}

function landOnce(state) {
  advanceWalk(state, WALK_STEP_SECONDS);
}

test("낙차 계산은 내리막 차이만 반환한다", () => {
  assert.equal(calculateDropDamage(50, 1), 49);
  assert.equal(calculateDropDamage(1, 50), 0);
  assert.equal(calculateDropDamage(25, 25), 0);
});

test("같거나 높은 칸의 도토리 획득은 1, 3, 7로 늘고 내리막에서만 초기화된다", () => {
  assert.deepEqual(calculateAscendingRecovery(10, 20, 0), { streak: 1, recovery: 1 });
  assert.deepEqual(calculateAscendingRecovery(20, 30, 1), { streak: 2, recovery: 3 });
  assert.deepEqual(calculateAscendingRecovery(30, 40, 2), { streak: 3, recovery: 7 });
  assert.deepEqual(calculateAscendingRecovery(30, 30, 3), { streak: 4, recovery: 15 });
  assert.deepEqual(calculateAscendingRecovery(30, 10, 3), { streak: 0, recovery: 0 });
});

test("같거나 높은 연속 흐름은 중간에 누적하지 않고 가장 큰 보상만 끝에서 한 번 지급한다", () => {
  const state = completeBoard([10, 20, 30, 40, 40, 50, 10, 20, 30, 40]);
  state.health = 80;
  startWalking(state);

  landOnce(state);
  assert.equal(state.health, 80);
  landOnce(state);
  assert.equal(state.health, 80);
  landOnce(state);
  assert.equal(state.health, 80);
  landOnce(state);
  assert.equal(state.health, 80);
  landOnce(state);
  assert.equal(state.health, 80);
  assert.equal(state.ascendingStreak, 4);
  landOnce(state);
  assert.equal(state.health, 111);
  assert.equal(state.lastHealing, 31);
  assert.equal(state.maxAscendingStreak, 5);
  landOnce(state);
  assert.equal(state.health, 71);
  assert.equal(state.ascendingStreak, 0);
  landOnce(state);
  assert.equal(state.health, 71);
  landOnce(state);
  assert.equal(state.health, 71);
  landOnce(state);
  assert.equal(state.health, 78);
  assert.equal(state.lastHealing, 7);
  assert.equal(state.maxAscendingStreak, 5);

  const cappedState = completeBoard([10, 20, 30, 40, 40, 40, 40, 40, 40, 40]);
  cappedState.health = 99;
  startWalking(cappedState);
  for (let index = 0; index < SLOT_COUNT; index += 1) landOnce(cappedState);
  assert.equal(cappedState.health, 610);
  assert.equal(cappedState.lastHealing, 511);
});

test("위험 표시는 인접 내리막만 왼쪽 순서로 만들고 기준면→첫 바위는 제외한다", () => {
  const slots = [50, 1, 25, 25, 10, 40, 39, 45, 2, 2];

  assert.deepEqual(findDangerousDrops(slots), [
    { fromIndex: 0, toIndex: 1, damage: 49 },
    { fromIndex: 3, toIndex: 4, damage: 15 },
    { fromIndex: 5, toIndex: 6, damage: 1 },
    { fromIndex: 7, toIndex: 8, damage: 43 },
  ]);
  assert.equal(findDangerousDrops([50, 50, 50]).length, 0);
});

test("짧은 길 확인 시간이 끝난 뒤 슬롯 0부터 9까지 순서대로 한 번씩 착지해 완주한다", () => {
  const state = completeBoard([5, 10, 15, 20, 25, 30, 35, 40, 45, 50]);
  const originalBoard = [...state.slots];
  advanceWalk(state, PATH_REVIEW_SECONDS / 2);
  assert.equal(state.phase, "path-review");
  assert.equal(state.characterSlot, -1);
  startWalking(state);

  const visitedSlots = [];
  for (let index = 0; index < SLOT_COUNT; index += 1) {
    landOnce(state);
    visitedSlots.push(state.characterSlot);
  }

  assert.deepEqual(visitedSlots, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(state.phase, "camera-transition");
  assert.equal(state.walkedSlots, 10);
  assert.equal(state.health, 611);
  assert.equal(state.currentHeight, 50);
  assert.equal(state.baseHeight, 50);
  assert.equal(state.completedSections, 1);
  assert.equal(state.rockSpeedMultiplier, 1.05);
  assert.deepEqual(state.slots, originalBoard);
});

test("50→1 낙차는 착지 순간 도토리 49개를 한 번만 떨어뜨린다", () => {
  const state = completeBoard([50, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
  startWalking(state);
  landOnce(state);
  assert.equal(state.health, 100);

  landOnce(state);
  assert.equal(state.characterSlot, 1);
  assert.equal(state.lastDamage, 49);
  assert.equal(state.health, 51);
  assert.equal(state.damageEffectRemaining, 0.7);

  advanceWalk(state, 0);
  advanceWalk(state, WALK_STEP_SECONDS / 2);
  assert.equal(state.characterSlot, 1);
  assert.equal(state.health, 51);
  assert.equal(state.damageEffectRemaining < 0.7, true);
});

test("누적 낙차로 도토리가 소진되면 0개로 고정하고 해당 나무토막에서 즉시 종료한다", () => {
  const heights = [50, 1, 50, 1, 50, 1, 50, 1, 50, 1];
  const state = completeBoard(heights);
  startWalking(state);

  while (state.phase === "walking") {
    landOnce(state);
  }

  assert.equal(state.phase, "game-over");
  assert.equal(state.health, 0);
  assert.equal(state.characterSlot, 5);
  assert.equal(state.currentHeight, 1);
  assert.equal(state.walkedSlots, 6);
  const stoppedBoard = [...state.slots];
  assert.equal(advanceWalk(state, WALK_STEP_SECONDS * 10), false);
  assert.equal(state.characterSlot, 5);
  assert.equal(state.walkedSlots, 6);
  assert.deepEqual(state.slots, stoppedBoard);
});
