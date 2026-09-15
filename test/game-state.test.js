import test from "node:test";
import assert from "node:assert/strict";

import {
  ROCK_MAX_HEIGHT,
  ROCK_MIN_HEIGHT,
  SLOT_COUNT,
  STARTING_HEALTH,
  advanceRock,
  createInitialState,
  placeCurrentRock,
  randomRockHeight,
  startGame,
} from "../src/game-state.js";

test("시작 화면에서 게임으로 전환하면 초기 정보와 빈칸 10개가 준비된다", () => {
  const state = createInitialState();

  assert.equal(state.screen, "start");
  assert.equal(startGame(state, () => 0.4), true);
  assert.equal(state.screen, "game");
  assert.equal(state.phase, "placing");
  assert.equal(state.health, STARTING_HEALTH);
  assert.equal(state.currentHeight, 0);
  assert.equal(state.slots.length, SLOT_COUNT);
  assert.equal(state.slots.every((slot) => slot === null), true);
});

test("무작위 바위 높이는 경곗값을 포함해 항상 1부터 50 사이 정수다", () => {
  const samples = [0, 0.0001, 0.02, 0.5, 0.98, 0.999999999999];
  const heights = samples.map((sample) => randomRockHeight(() => sample));

  assert.equal(heights[0], ROCK_MIN_HEIGHT);
  assert.equal(heights.at(-1), ROCK_MAX_HEIGHT);
  for (const height of heights) {
    assert.equal(Number.isInteger(height), true);
    assert.equal(height >= ROCK_MIN_HEIGHT, true);
    assert.equal(height <= ROCK_MAX_HEIGHT, true);
  }
});

test("바위가 게임판에 들어오기 전에는 배치되지 않는다", () => {
  const state = createInitialState();
  startGame(state, () => 0.5);

  assert.equal(state.highlightedSlot, null);
  assert.equal(placeCurrentRock(state), false);
  assert.equal(state.placementCount, 0);
});

test("이동 중인 바위를 강조된 빈칸 하나에만 고정한다", () => {
  const state = createInitialState();
  startGame(state, () => 0.5);
  advanceRock(state, 2);

  const targetSlot = state.highlightedSlot;
  assert.notEqual(targetSlot, null);
  assert.equal(placeCurrentRock(state), true);
  assert.equal(state.slots[targetSlot], 26);
  assert.equal(state.slots.filter((slot) => slot !== null).length, 1);
  assert.equal(state.placementCount, 1);
  assert.equal(state.phase, "placing");
  assert.notEqual(state.currentRock, null);
});

test("매우 빠른 두 번째 입력도 같은 바위를 중복 배치하지 않는다", () => {
  const state = createInitialState();
  startGame(state, () => 0.1);
  advanceRock(state, 1);

  assert.equal(placeCurrentRock(state), true);
  assert.equal(placeCurrentRock(state), false);
  assert.equal(state.slots.filter((slot) => slot !== null).length, 1);
  assert.equal(state.placementCount, 1);
});
