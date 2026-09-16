import test from "node:test";
import assert from "node:assert/strict";

import {
  SLOT_COUNT,
  ROCK_ARRIVAL_SECONDS,
  ROCK_PLACEMENT_SECONDS,
  advancePlacementAnimations,
  advanceRock,
  autoPlaceCurrentRock,
  createInitialState,
  placeCurrentRock,
  startGame,
} from "../src/game-state.js";

const repeatedHeightRandom = () => 0.2;

test("새 나무토막 등장과 선택 칸 배치 애니메이션이 시간에 따라 완료된다", () => {
  const state = createInitialState();
  startGame(state, repeatedHeightRandom);
  assert.equal(state.currentRock.spawnProgress, 0);
  advancePlacementAnimations(state, ROCK_ARRIVAL_SECONDS / 2);
  assert.equal(state.currentRock.spawnProgress, 0.5);
  advancePlacementAnimations(state, ROCK_ARRIVAL_SECONDS / 2);
  assert.equal(state.currentRock.spawnProgress, 1);

  state.currentRock.position = 0.075;
  advanceRock(state, 0, repeatedHeightRandom);
  assert.equal(placeCurrentRock(state, repeatedHeightRandom), true);
  assert.equal(state.placementAnimation.slotIndex, 1);
  advancePlacementAnimations(state, ROCK_PLACEMENT_SECONDS);
  assert.equal(state.placementAnimation, null);
  assert.equal(state.currentRock.spawnDelay, 0);
});

test("배치 직후 같은 높이도 가능한 새 바위가 오른쪽에서 출발한다", () => {
  const state = createInitialState();
  startGame(state, repeatedHeightRandom);
  const firstHeight = state.currentRock.height;
  state.currentRock.position = 0.425;
  advanceRock(state, 0, repeatedHeightRandom);

  assert.equal(placeCurrentRock(state, repeatedHeightRandom), true);
  assert.equal(state.placementCount, 1);
  assert.equal(state.slots[8], firstHeight);
  assert.equal(state.currentRock.height, firstHeight);
  assert.equal(state.currentRock.position > 1, true);
  assert.equal(state.highlightedSlot, null);
});

test("채워진 칸은 강조·배치하지 않고 현재 바위는 다음 빈칸으로 계속 이동한다", () => {
  const state = createInitialState();
  startGame(state, repeatedHeightRandom);
  state.currentRock.position = 0.275;
  advanceRock(state, 0, repeatedHeightRandom);
  placeCurrentRock(state, repeatedHeightRandom);
  const fixedHeight = state.slots[5];
  const movingHeight = state.currentRock.height;

  state.currentRock.position = 0.28;
  advanceRock(state, 0, repeatedHeightRandom);
  assert.equal(state.highlightedSlot, null);
  assert.equal(placeCurrentRock(state, repeatedHeightRandom), false);
  assert.equal(state.slots[5], fixedHeight);
  assert.equal(state.currentRock.height, movingHeight);

  const positionOverFilledSlot = state.currentRock.position;
  advanceRock(state, 0.5, repeatedHeightRandom);
  assert.equal(state.currentRock.position < positionOverFilledSlot, true);
  assert.equal(state.highlightedSlot, 4);
  assert.equal(placeCurrentRock(state, repeatedHeightRandom), true);
  assert.equal(state.slots[5], fixedHeight);
  assert.equal(state.placementCount, 2);
});

test("좌단에 도착한 바위는 남아 있는 가장 왼쪽 칸에 자동 배치된다", () => {
  const state = createInitialState();
  startGame(state, repeatedHeightRandom);
  state.currentRock.position = 0.075;
  advanceRock(state, 0, repeatedHeightRandom);
  placeCurrentRock(state, repeatedHeightRandom);
  const firstFixedHeight = state.slots[1];

  state.currentRock.position = 0.05;
  assert.equal(advanceRock(state, 0, repeatedHeightRandom), true);
  assert.equal(state.placementCount, 2);
  assert.equal(state.lastPlacement.method, "automatic");
  assert.equal(state.lastPlacement.slotIndex, 0);
  assert.equal(state.slots[1], firstFixedHeight);
  assert.notEqual(state.slots[0], null);
  assert.notEqual(state.slots[1], null);
  assert.notEqual(state.currentRock, null);
});

test("수동·자동 배치를 섞어도 정확히 20개에서 생성과 입력이 종료된다", () => {
  const state = createInitialState();
  startGame(state, repeatedHeightRandom);

  for (let index = 0; index < SLOT_COUNT; index += 1) {
    if (index % 2 === 0) {
      const rightmostEmptySlot = state.slots.lastIndexOf(null);
      state.currentRock.position = (rightmostEmptySlot + 0.5) / SLOT_COUNT;
      advanceRock(state, 0, repeatedHeightRandom);
      assert.equal(placeCurrentRock(state, repeatedHeightRandom), true);
    } else {
      state.currentRock.position = 0.05;
      assert.equal(advanceRock(state, 0, repeatedHeightRandom), true);
    }
  }

  const completedSlots = [...state.slots];
  assert.equal(state.placementCount, SLOT_COUNT);
  assert.equal(state.slots.filter((height) => height !== null).length, SLOT_COUNT);
  assert.equal(state.phase, "path-review");
  assert.equal(state.currentRock, null);
  assert.equal(state.highlightedSlot, null);
  assert.equal(placeCurrentRock(state, repeatedHeightRandom), false);
  assert.equal(autoPlaceCurrentRock(state, repeatedHeightRandom), false);
  assert.equal(advanceRock(state, 10, repeatedHeightRandom), false);
  assert.deepEqual(state.slots, completedSlots);
});
