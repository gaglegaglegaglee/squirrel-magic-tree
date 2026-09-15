import test from "node:test";
import assert from "node:assert/strict";

import { createGameController, TUTORIAL_STEPS } from "../src/game-controller.js";

class FakeElement {
  constructor(hidden = false) {
    this.hidden = hidden;
    this.inert = false;
    this.textContent = "";
    this.style = {};
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  removeEventListener(type, listener) {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  }

  emit(type, event = {}) {
    return this.listeners.get(type)?.(event);
  }

  focus() {
    this.focused = true;
  }
}

function integrationHarness() {
  const names = [
    "startScreen", "gameScreen", "startButton", "canvas", "healthValue", "heightValue",
    "gameStatus", "exitButton", "restartButton", "resetRecordButton", "resultOverlay",
    "resultHeight", "resultWalked", "resultBestHeight", "resultBestWalked", "startBestHeight",
    "startBestWalked", "startStorageWarning", "resultStorageWarning", "startHelpButton",
    "gameHelpButton", "tutorialOverlay", "tutorialStepNumber", "tutorialText",
    "tutorialNextButton", "orientationOverlay",
  ];
  const elements = Object.fromEntries(names.map((name) => [name, new FakeElement()]));
  elements.gameScreen.hidden = true;
  elements.resultOverlay.hidden = true;
  elements.tutorialOverlay.hidden = true;
  elements.orientationOverlay.hidden = true;
  elements.canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600 });
  const scheduledFrames = [];
  const cancelledFrames = [];
  const savedRecords = [];
  let tutorialSeen = false;
  let nextFrameId = 0;
  const controller = createGameController({
    elements,
    renderFrame: () => {},
    random: () => 0.4,
    requestFrame: (callback) => {
      scheduledFrames.push(callback);
      nextFrameId += 1;
      return nextFrameId;
    },
    cancelFrame: (id) => cancelledFrames.push(id),
    recordStore: {
      load: () => ({ record: { height: 0, walkedSlots: 0 }, failed: false }),
      save: (record) => {
        savedRecords.push({ ...record });
        return true;
      },
      clear: () => true,
    },
    tutorialStore: {
      loadSeen: () => ({ seen: tutorialSeen, failed: false }),
      markSeen: () => {
        tutorialSeen = true;
        return true;
      },
    },
    confirmAction: () => true,
  });
  return { controller, elements, scheduledFrames, cancelledFrames, savedRecords, tutorialSeen: () => tutorialSeen };
}

function placeHeights(controller, elements, heights) {
  for (let slotIndex = 0; slotIndex < heights.length; slotIndex += 1) {
    controller.state.currentRock.height = heights[slotIndex];
    elements.canvas.emit("pointerdown", { clientX: 179 + (slotIndex + 0.5) * 74.375, clientY: 300 });
  }
}

test("시작→첫 안내→첫 구간→다음 구간→사망→기록→재시작이 한 흐름으로 동작한다", () => {
  const harness = integrationHarness();
  const { controller, elements, scheduledFrames, savedRecords } = harness;
  elements.startButton.emit("click");
  assert.equal(elements.tutorialOverlay.hidden, false);
  assert.equal(elements.tutorialText.textContent, TUTORIAL_STEPS[0]);
  assert.equal(scheduledFrames.length, 0);

  for (let step = 0; step < TUTORIAL_STEPS.length; step += 1) {
    elements.tutorialNextButton.emit("click");
  }
  assert.equal(elements.tutorialOverlay.hidden, true);
  assert.equal(harness.tutorialSeen(), true);
  assert.equal(scheduledFrames.length, 0);

  placeHeights(controller, elements, Array(10).fill(10));
  let frameIndex = 0;
  let now = 0;
  for (; frameIndex < 120 && controller.state.completedSections < 1; frameIndex += 1) {
    now += 100;
    scheduledFrames[frameIndex](now);
  }
  for (; frameIndex < 150 && controller.state.phase !== "placing"; frameIndex += 1) {
    now += 100;
    scheduledFrames[frameIndex](now);
  }
  assert.equal(controller.state.phase, "placing");
  assert.equal(controller.state.baseHeight, 10);
  assert.equal(controller.state.walkedSlots, 10);

  placeHeights(controller, elements, [50, 1, 50, 1, 50, 1, 50, 1, 50, 1]);
  for (; frameIndex < 250 && controller.state.phase !== "game-over"; frameIndex += 1) {
    now += 100;
    scheduledFrames[frameIndex](now);
  }
  assert.equal(controller.state.phase, "game-over");
  assert.equal(controller.state.currentHeight, 11);
  assert.equal(controller.state.walkedSlots, 16);
  assert.equal(elements.resultOverlay.hidden, false);
  assert.deepEqual(savedRecords, [{ height: 11, walkedSlots: 16 }]);

  elements.restartButton.emit("click");
  assert.equal(controller.state.phase, "placing");
  assert.equal(controller.state.health, 100);
  assert.equal(controller.state.currentHeight, 0);
  assert.equal(controller.state.walkedSlots, 0);
  assert.deepEqual(controller.getBestRecord(), { height: 11, walkedSlots: 16 });
  assert.equal(elements.tutorialOverlay.hidden, true);
  controller.destroy();
});
