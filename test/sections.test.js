import test from "node:test";
import assert from "node:assert/strict";

import {
  CAMERA_TRANSITION_SECONDS,
  PATH_REVIEW_SECONDS,
  SLOT_COUNT,
  WALK_STEP_SECONDS,
  advanceCameraTransition,
  advanceRock,
  advanceWalk,
  autoPlaceCurrentRock,
  bounceHeightForProgress,
  cameraOffsetForProgress,
  createInitialState,
  placeCurrentRock,
  speedMultiplierForSections,
  startGame,
} from "../src/game-state.js";

const fixedRandom = () => 0.4;

function placeBoard(state, heights) {
  for (let slotIndex = 0; slotIndex < SLOT_COUNT; slotIndex += 1) {
    state.currentRock.height = heights[slotIndex];
    state.currentRock.position = (slotIndex + 0.51) / SLOT_COUNT;
    advanceRock(state, 0, fixedRandom);
    assert.equal(placeCurrentRock(state, fixedRandom), true);
  }
}

function walkWholeBoard(state) {
  advanceWalk(state, PATH_REVIEW_SECONDS);
  for (let index = 0; index < SLOT_COUNT; index += 1) {
    advanceWalk(state, WALK_STEP_SECONDS);
  }
}

test("두 구간을 반복하면 마지막 절대 높이와 발밑 나무토막을 승계하고 도토리·누적 칸을 보존한다", () => {
  const state = createInitialState();
  startGame(state, fixedRandom);
  state.health = 95;

  placeBoard(state, Array(SLOT_COUNT).fill(10));
  walkWholeBoard(state);
  assert.equal(state.phase, "camera-transition");
  assert.equal(state.baseHeight, 10);
  assert.equal(state.currentHeight, 10);
  assert.equal(state.health, 1108);
  assert.equal(state.walkedSlots, 10);
  assert.equal(state.completedSections, 1);
  assert.equal(state.rockSpeedMultiplier, 1.05);

  advanceCameraTransition(state, CAMERA_TRANSITION_SECONDS, fixedRandom);
  assert.equal(state.phase, "placing");
  assert.equal(state.slots.length, SLOT_COUNT);
  assert.equal(state.slots.every((height) => height === null), true);
  assert.notEqual(state.currentRock, null);
  assert.equal(state.characterSlot, -1);
  assert.equal(state.baseHeight, 10);
  assert.equal(state.currentHeight, 10);
  assert.equal(state.health, 1108);
  assert.equal(state.walkedSlots, 10);
  assert.equal(state.startingLogHeight, 10);

  placeBoard(state, Array(SLOT_COUNT).fill(20));
  advanceWalk(state, PATH_REVIEW_SECONDS);
  advanceWalk(state, WALK_STEP_SECONDS);
  assert.equal(state.currentHeight, 30);
  for (let index = 1; index < SLOT_COUNT; index += 1) {
    advanceWalk(state, WALK_STEP_SECONDS);
  }

  assert.equal(state.phase, "camera-transition");
  assert.equal(state.baseHeight, 30);
  assert.equal(state.currentHeight, 30);
  assert.equal(state.health, 2121);
  assert.equal(state.walkedSlots, 20);
  assert.equal(state.completedSections, 2);
  assert.equal(state.rockSpeedMultiplier, 1.1);
  assert.equal(Number.isInteger(state.baseHeight), true);
  assert.equal(Number.isInteger(state.walkedSlots), true);
});

test("카메라 전환 중 입력과 재호출은 보드나 바위를 중복 생성하지 않는다", () => {
  const state = createInitialState();
  startGame(state, fixedRandom);
  placeBoard(state, Array(SLOT_COUNT).fill(12));
  walkWholeBoard(state);
  const completedBoard = [...state.slots];

  assert.equal(placeCurrentRock(state, fixedRandom), false);
  assert.equal(autoPlaceCurrentRock(state, fixedRandom), false);
  assert.equal(advanceRock(state, 10, fixedRandom), false);
  advanceCameraTransition(state, CAMERA_TRANSITION_SECONDS / 2, fixedRandom);
  assert.equal(state.phase, "camera-transition");
  assert.equal(state.currentRock, null);
  assert.deepEqual(state.slots, completedBoard);

  advanceCameraTransition(state, CAMERA_TRANSITION_SECONDS / 2, fixedRandom);
  const onlyNewRock = state.currentRock;
  assert.equal(state.phase, "placing");
  assert.equal(state.placementCount, 0);
  assert.equal(state.slots.filter((height) => height !== null).length, 0);
  assert.equal(state.startingLogHeight, 12);
  assert.equal(advanceCameraTransition(state, CAMERA_TRANSITION_SECONDS, fixedRandom), false);
  assert.equal(state.currentRock, onlyNewRock);
});

test("속도 배수는 구간마다 0.05 상승해 2.00에서 멈추고 바위 이동량에만 반영된다", () => {
  assert.equal(speedMultiplierForSections(0), 1);
  assert.equal(speedMultiplierForSections(1), 1.05);
  assert.equal(speedMultiplierForSections(19), 1.95);
  assert.equal(speedMultiplierForSections(20), 2);
  assert.equal(speedMultiplierForSections(200), 2);

  const normalState = createInitialState();
  const fastState = createInitialState();
  startGame(normalState, fixedRandom);
  startGame(fastState, fixedRandom);
  fastState.rockSpeedMultiplier = 2;
  const normalStart = normalState.currentRock.position;
  const fastStart = fastState.currentRock.position;
  advanceRock(normalState, 1, fixedRandom);
  advanceRock(fastState, 1, fixedRandom);
  const normalDistance = normalStart - normalState.currentRock.position;
  const fastDistance = fastStart - fastState.currentRock.position;
  assert.equal(Math.abs(fastDistance - normalDistance * 2) < 1e-12, true);
  assert.equal(WALK_STEP_SECONDS, 0.55);
  assert.equal(CAMERA_TRANSITION_SECONDS, 0.9);
});

test("카메라는 전환 내내 한 방향인 오른쪽 위로 이동한다", () => {
  assert.deepEqual(cameraOffsetForProgress(0), { x: 0, y: 0 });
  assert.deepEqual(cameraOffsetForProgress(0.5), { x: -160, y: 95 });
  assert.deepEqual(cameraOffsetForProgress(1), { x: -320, y: 190 });
  assert.deepEqual(cameraOffsetForProgress(2), { x: -320, y: 190 });
});

test("카메라 전환 끝은 현재 점과 새 왼쪽 시작점의 차이를 정확히 메운다", () => {
  const character = { x: 1420, y: 600 };
  const start = { x: 132, y: 777 };
  const targetX = start.x - character.x;
  const targetY = start.y - character.y;

  assert.deepEqual(cameraOffsetForProgress(0.5, targetX, targetY), {
    x: -644,
    y: 88.5,
  });
  assert.deepEqual(cameraOffsetForProgress(1, targetX, targetY), {
    x: targetX,
    y: targetY,
  });
});

test("점은 이동 시작과 착지에서는 바닥에 있고 중간에서 가장 높이 튄다", () => {
  assert.equal(bounceHeightForProgress(0), 0);
  assert.equal(bounceHeightForProgress(0.5), 42);
  assert.equal(Math.abs(bounceHeightForProgress(1)) < 1e-12, true);
});
