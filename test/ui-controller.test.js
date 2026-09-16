import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { bootstrapGame } from "../src/app.js";
import { createGameController, TUTORIAL_STEPS } from "../src/game-controller.js";

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
    this.hidden = false;
    this.textContent = "";
    this.style = {};
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  removeEventListener(type, listener) {
    if (this.listeners.get(type) === listener) {
      this.listeners.delete(type);
    }
  }

  emit(type, event = {}) {
    return this.listeners.get(type)?.(event);
  }

  focus() {
    this.focused = true;
  }
}

function createUiHarness(random = () => 0.5, options = {}) {
  const startScreen = new FakeEventTarget();
  const gameScreen = new FakeEventTarget();
  gameScreen.hidden = true;
  const startButton = new FakeEventTarget();
  const canvas = new FakeEventTarget();
  canvas.getBoundingClientRect = () => ({ left: 10, top: 20, right: 810, bottom: 470, width: 800, height: 450 });
  const healthValue = new FakeEventTarget();
  const heightValue = new FakeEventTarget();
  const gameStatus = new FakeEventTarget();
  const exitButton = new FakeEventTarget();
  const restartButton = new FakeEventTarget();
  const resetRecordButton = new FakeEventTarget();
  const resultOverlay = new FakeEventTarget();
  resultOverlay.hidden = true;
  const resultHeight = new FakeEventTarget();
  const resultWalked = new FakeEventTarget();
  const resultBestHeight = new FakeEventTarget();
  const resultBestWalked = new FakeEventTarget();
  const startBestHeight = new FakeEventTarget();
  const startBestWalked = new FakeEventTarget();
  const startStorageWarning = new FakeEventTarget();
  const resultStorageWarning = new FakeEventTarget();
  const startHelpButton = new FakeEventTarget();
  const gameHelpButton = new FakeEventTarget();
  const tutorialOverlay = new FakeEventTarget();
  tutorialOverlay.hidden = true;
  const tutorialStepNumber = new FakeEventTarget();
  const tutorialText = new FakeEventTarget();
  const tutorialNextButton = new FakeEventTarget();
  const orientationOverlay = new FakeEventTarget();
  orientationOverlay.hidden = true;
  startStorageWarning.textContent = "기록을 이 기기에 저장하지 못했습니다.";
  resultStorageWarning.textContent = "기록을 이 기기에 저장하지 못했습니다.";
  const renderedStates = [];
  const cancelledFrames = [];
  const scheduledFrames = [];
  let nextFrameId = 0;

  const controller = createGameController({
    elements: {
      startScreen,
      gameScreen,
      startButton,
      canvas,
      healthValue,
      heightValue,
      gameStatus,
      exitButton,
      restartButton,
      resetRecordButton,
      resultOverlay,
      resultHeight,
      resultWalked,
      resultBestHeight,
      resultBestWalked,
      startBestHeight,
      startBestWalked,
      startStorageWarning,
      resultStorageWarning,
      startHelpButton,
      gameHelpButton,
      tutorialOverlay,
      tutorialStepNumber,
      tutorialText,
      tutorialNextButton,
      orientationOverlay,
    },
    renderFrame: (state) => {
      renderedStates.push({ screen: state.screen, placementCount: state.placementCount });
    },
    random,
    requestFrame: (callback) => {
      nextFrameId += 1;
      scheduledFrames.push(callback);
      return nextFrameId;
    },
    cancelFrame: (frameId) => cancelledFrames.push(frameId),
    recordStore: options.recordStore ?? {
      load: () => ({ record: { height: 0, walkedSlots: 0 }, failed: false }),
      save: () => true,
      clear: () => true,
    },
    confirmAction: options.confirmAction ?? (() => false),
    tutorialStore: options.tutorialStore ?? {
      loadSeen: () => ({ seen: true, failed: false }),
      markSeen: () => true,
    },
  });

  return {
    controller,
    elements: {
      startScreen,
      gameScreen,
      startButton,
      canvas,
      healthValue,
      heightValue,
      gameStatus,
      exitButton,
      restartButton,
      resetRecordButton,
      resultOverlay,
      resultHeight,
      resultWalked,
      resultBestHeight,
      resultBestWalked,
      startBestHeight,
      startBestWalked,
      startStorageWarning,
      resultStorageWarning,
      startHelpButton,
      gameHelpButton,
      tutorialOverlay,
      tutorialStepNumber,
      tutorialText,
      tutorialNextButton,
      orientationOverlay,
    },
    renderedStates,
    cancelledFrames,
    scheduledFrames,
  };
}

function clickSlot(elements, slotIndex) {
  const boardLeft = 10 + (286 / 1600) * 800;
  const slotWidth = (1190 / 1600) * 800 / 10;
  elements.canvas.emit("pointerdown", {
    clientX: boardLeft + (slotIndex + 0.5) * slotWidth,
    clientY: 200,
  });
}

test("실제 시작 버튼 click 연결이 화면 hidden 상태와 HUD를 바꾸고 첫 Canvas 렌더를 요청한다", () => {
  const harness = createUiHarness();
  const { controller, elements, renderedStates } = harness;

  assert.equal(elements.startButton.listeners.has("click"), true);
  elements.startButton.emit("click");

  assert.equal(elements.startScreen.hidden, true);
  assert.equal(elements.gameScreen.hidden, false);
  assert.equal(elements.healthValue.textContent, "100개");
  assert.equal(elements.heightValue.textContent, "0");
  assert.deepEqual(renderedStates, [{ screen: "game", placementCount: 0 }]);
  controller.destroy();
});

test("Canvas pointerdown 연결은 내부 입력 하나만 배치하고 외부·연속 입력을 무시한다", () => {
  const harness = createUiHarness();
  const { controller, elements, renderedStates, cancelledFrames } = harness;
  elements.startButton.emit("click");

  assert.equal(elements.canvas.listeners.has("pointerdown"), true);
  elements.canvas.emit("pointerdown", { clientX: 0, clientY: 0 });
  assert.equal(controller.state.placementCount, 0);

  clickSlot(elements, 3);
  clickSlot(elements, 3);

  assert.equal(controller.state.placementCount, 1);
  assert.equal(controller.state.slots.filter((slot) => slot !== null).length, 1);
  assert.equal(renderedStates.at(-1).placementCount, 1);
  assert.deepEqual(cancelledFrames, []);
  controller.destroy();
});

test("배치 단계에서는 시간 경과로 자동 배치되지 않고 빈칸 클릭을 기다린다", () => {
  const harness = createUiHarness();
  const { controller, elements, scheduledFrames } = harness;
  elements.startButton.emit("click");
  assert.equal(scheduledFrames.length, 1);
  assert.equal(controller.state.placementCount, 0);
  assert.equal(controller.state.phase, "placing");
  assert.notEqual(controller.state.currentRock, null);
  assert.match(elements.gameStatus.textContent, /빈칸/);
  controller.destroy();
});

test("열 번째 pointer 배치 뒤에는 길 완성을 알리고 추가 배치를 막는다", () => {
  const harness = createUiHarness();
  const { controller, elements, cancelledFrames } = harness;
  elements.startButton.emit("click");

  for (let slotIndex = 9; slotIndex >= 0; slotIndex -= 1) {
    clickSlot(elements, slotIndex);
  }

  assert.equal(controller.state.phase, "path-review");
  assert.equal(controller.state.placementCount, 10);
  assert.equal(controller.state.currentRock, null);
  assert.equal(controller.state.slots.every((height) => height !== null), true);
  assert.match(elements.gameStatus.textContent, /길 완성/);
  assert.equal(elements.canvas.style.cursor, "default");
  assert.deepEqual(cancelledFrames, []);

  elements.canvas.emit("pointerdown", { clientX: 400, clientY: 200 });
  assert.equal(controller.state.placementCount, 10);
  controller.destroy();
});

test("walking 동안 입력을 잠그고 도토리 소진 착지에서 HUD와 안내를 갱신한 뒤 정지한다", () => {
  const harness = createUiHarness();
  const { controller, elements, scheduledFrames } = harness;
  const heights = [50, 1, 50, 1, 50, 1, 50, 1, 50, 1];
  elements.startButton.emit("click");

  for (let slotIndex = 0; slotIndex < heights.length; slotIndex += 1) {
    controller.state.currentRock.height = heights[slotIndex];
    clickSlot(elements, slotIndex);
  }

  const completedBoard = [...controller.state.slots];
  elements.canvas.emit("pointerdown", { clientX: 400, clientY: 200 });
  assert.deepEqual(controller.state.slots, completedBoard);

  let now = 0;
  for (let frameIndex = 0; frameIndex < 100 && controller.state.phase !== "game-over"; frameIndex += 1) {
    const frame = scheduledFrames[frameIndex];
    assert.equal(typeof frame, "function");
    now += 100;
    frame(now);
  }

  assert.equal(controller.state.phase, "game-over");
  assert.equal(controller.state.characterSlot, 5);
  assert.equal(controller.state.walkedSlots, 6);
  assert.equal(controller.state.health, 0);
  assert.equal(elements.healthValue.textContent, "0개");
  assert.equal(elements.heightValue.textContent, "1");
  assert.match(elements.gameStatus.textContent, /도토리 소진/);
  assert.equal(elements.resultOverlay.hidden, false);
  assert.equal(elements.resultHeight.textContent, "1");
  assert.equal(elements.resultWalked.textContent, "6");
  assert.equal(elements.resultBestHeight.textContent, "1");
  assert.equal(elements.resultBestWalked.textContent, "6");
  assert.equal(elements.restartButton.focused, true);
  assert.equal(elements.gameScreen.inert, true);
  assert.deepEqual(controller.getBestRecord(), { height: 1, walkedSlots: 6 });

  let preventedKeys = 0;
  elements.resultOverlay.emit("keydown", { key: "Escape", preventDefault: () => { preventedKeys += 1; } });
  elements.resultOverlay.emit("keydown", { key: "Tab", preventDefault: () => { preventedKeys += 1; } });
  assert.equal(preventedKeys, 2);
  assert.equal(elements.resultOverlay.hidden, false);

  elements.canvas.emit("pointerdown", { clientX: 400, clientY: 200 });
  assert.equal(controller.state.characterSlot, 5);
  assert.deepEqual(controller.state.slots, completedBoard);

  elements.restartButton.emit("click");
  assert.equal(elements.resultOverlay.hidden, true);
  assert.equal(elements.gameScreen.inert, false);
  assert.equal(controller.state.phase, "placing");
  assert.equal(controller.state.health, 100);
  assert.equal(controller.state.baseHeight, 0);
  assert.equal(controller.state.currentHeight, 0);
  assert.equal(controller.state.walkedSlots, 0);
  assert.equal(controller.state.completedSections, 0);
  assert.equal(controller.state.rockSpeedMultiplier, 1);
  assert.equal(controller.state.slots.every((height) => height === null), true);
  assert.equal(controller.state.characterSlot, -1);
  assert.equal(controller.state.cameraTransitionProgress, 0);
  assert.deepEqual(controller.getBestRecord(), { height: 1, walkedSlots: 6 });
  controller.destroy();
});

test("첫 게임의 3단계 안내는 상태를 멈추고 완료 뒤 정확한 지점에서 재개한다", () => {
  let markSeenCalls = 0;
  const harness = createUiHarness(() => 0.5, {
    tutorialStore: {
      loadSeen: () => ({ seen: false, failed: false }),
      markSeen: () => {
        markSeenCalls += 1;
        return false;
      },
    },
  });
  const { controller, elements, scheduledFrames } = harness;
  elements.startButton.emit("click");

  assert.equal(elements.tutorialOverlay.hidden, false);
  assert.equal(elements.gameScreen.inert, true);
  assert.deepEqual([...controller.getPauseReasons()], ["tutorial"]);
  assert.equal(scheduledFrames.length, 0);
  const rockPosition = controller.state.currentRock.position;
  elements.canvas.emit("pointerdown", { clientX: 400, clientY: 200 });
  assert.equal(controller.state.placementCount, 0);

  const shownSteps = [];
  for (let step = 0; step < TUTORIAL_STEPS.length; step += 1) {
    shownSteps.push(elements.tutorialText.textContent);
    elements.tutorialNextButton.emit("click");
  }
  assert.deepEqual(shownSteps, TUTORIAL_STEPS);
  assert.equal(elements.tutorialOverlay.hidden, true);
  assert.equal(elements.gameScreen.inert, false);
  assert.equal(markSeenCalls, 1);
  assert.equal(controller.state.currentRock.position, rockPosition);
  assert.equal(scheduledFrames.length, 1);
  assert.match(elements.gameStatus.textContent, /저장하지 못했습니다/);

  elements.gameHelpButton.emit("click");
  assert.equal(elements.tutorialOverlay.hidden, false);
  assert.equal(controller.state.currentRock.position, rockPosition);
  for (let step = 0; step < TUTORIAL_STEPS.length; step += 1) {
    elements.tutorialNextButton.emit("click");
  }
  assert.equal(scheduledFrames.length, 2);
  controller.destroy();
});

test("시작 화면 도움말도 키보드 사용 가능한 버튼으로 같은 3단계 안내를 연다", () => {
  const harness = createUiHarness();
  const { controller, elements } = harness;
  assert.equal(elements.startHelpButton.listeners.has("click"), true);
  elements.startHelpButton.emit("click");
  assert.equal(elements.tutorialOverlay.hidden, false);
  assert.equal(elements.startScreen.inert, true);
  assert.equal(elements.tutorialText.textContent, TUTORIAL_STEPS[0]);
  for (let step = 0; step < TUTORIAL_STEPS.length; step += 1) {
    elements.tutorialNextButton.emit("click");
  }
  assert.equal(elements.tutorialOverlay.hidden, true);
  assert.equal(elements.startScreen.inert, false);
  assert.equal(controller.state.screen, "start");
  controller.destroy();
});

test("도움말·화면 방향·탭 숨김 pause reason이 모두 해제된 뒤에만 재개한다", () => {
  const harness = createUiHarness();
  const { controller, elements, scheduledFrames } = harness;
  elements.startButton.emit("click");
  const startingPosition = controller.state.currentRock.position;
  controller.openTutorial();
  controller.updateViewport(550, 300);
  controller.setDocumentHidden(true);

  assert.deepEqual(
    [...controller.getPauseReasons()].sort(),
    ["orientation", "tutorial", "visibility"],
  );
  assert.equal(elements.orientationOverlay.hidden, false);
  assert.equal(controller.state.currentRock.position, startingPosition);

  for (let step = 0; step < TUTORIAL_STEPS.length; step += 1) {
    elements.tutorialNextButton.emit("click");
  }
  assert.deepEqual([...controller.getPauseReasons()].sort(), ["orientation", "visibility"]);
  controller.updateViewport(800, 400);
  assert.deepEqual([...controller.getPauseReasons()], ["visibility"]);
  assert.equal(elements.orientationOverlay.hidden, true);
  assert.equal(scheduledFrames.length, 1);

  controller.setDocumentHidden(false);
  assert.equal(controller.getPauseReasons().size, 0);
  assert.equal(scheduledFrames.length, 2);
  assert.equal(controller.state.currentRock.position, startingPosition);
  controller.destroy();
});

test("재로딩된 최고 기록을 시작 화면에 표시하고 나가기·초기화 각각의 확인 취소와 승인을 지킨다", () => {
  const confirmations = [false, true, false, true];
  const prompts = [];
  let clearCount = 0;
  const recordStore = {
    load: () => ({ record: { height: 88, walkedSlots: 42 }, failed: false }),
    save: () => true,
    clear: () => {
      clearCount += 1;
      return true;
    },
  };
  const harness = createUiHarness(() => 0.5, {
    recordStore,
    confirmAction: (message) => {
      prompts.push(message);
      return confirmations.shift();
    },
  });
  const { controller, elements } = harness;
  assert.equal(elements.startBestHeight.textContent, "88");
  assert.equal(elements.startBestWalked.textContent, "42");

  elements.startButton.emit("click");
  clickSlot(elements, 5);
  const boardBeforeCancel = [...controller.state.slots];
  elements.exitButton.emit("click");
  assert.equal(controller.state.screen, "game");
  assert.deepEqual(controller.state.slots, boardBeforeCancel);
  assert.equal(elements.gameScreen.hidden, false);

  elements.exitButton.emit("click");
  assert.equal(controller.state.screen, "start");
  assert.equal(elements.gameScreen.hidden, true);
  assert.equal(elements.startScreen.hidden, false);
  assert.deepEqual(controller.getBestRecord(), { height: 88, walkedSlots: 42 });

  elements.resetRecordButton.emit("click");
  assert.deepEqual(controller.getBestRecord(), { height: 88, walkedSlots: 42 });
  assert.equal(clearCount, 0);
  elements.resetRecordButton.emit("click");
  assert.deepEqual(controller.getBestRecord(), { height: 0, walkedSlots: 0 });
  assert.equal(elements.startBestHeight.textContent, "0");
  assert.equal(elements.startBestWalked.textContent, "0");
  assert.equal(clearCount, 1);
  assert.equal(prompts.length, 4);
  assert.notEqual(prompts[0], prompts[2]);
  controller.destroy();
});

test("기록 초기화 저장이 실패하면 기존 최고 기록을 유지하고 짧은 안내를 표시한다", () => {
  const harness = createUiHarness(() => 0.5, {
    recordStore: {
      load: () => ({ record: { height: 70, walkedSlots: 30 }, failed: false }),
      save: () => true,
      clear: () => false,
    },
    confirmAction: () => true,
  });
  const { controller, elements } = harness;

  elements.resetRecordButton.emit("click");
  assert.deepEqual(controller.getBestRecord(), { height: 70, walkedSlots: 30 });
  assert.equal(elements.startBestHeight.textContent, "70");
  assert.equal(elements.startBestWalked.textContent, "30");
  assert.equal(elements.startStorageWarning.hidden, false);
  controller.destroy();
});

test("저장소 읽기·쓰기 실패를 민감한 세부 없이 안내하고 게임과 결과를 계속 제공한다", () => {
  const recordStore = {
    load: () => ({ record: { height: 0, walkedSlots: 0 }, failed: true }),
    save: () => false,
    clear: () => false,
  };
  const harness = createUiHarness(() => 0.5, { recordStore });
  const { controller, elements, scheduledFrames } = harness;
  assert.equal(elements.startStorageWarning.hidden, false);
  elements.startButton.emit("click");
  const heights = [50, 1, 50, 1, 50, 1, 50, 1, 50, 1];
  for (let slotIndex = 0; slotIndex < heights.length; slotIndex += 1) {
    controller.state.currentRock.height = heights[slotIndex];
    clickSlot(elements, slotIndex);
  }

  let now = 0;
  for (let frameIndex = 0; frameIndex < 100 && controller.state.phase !== "game-over"; frameIndex += 1) {
    now += 100;
    scheduledFrames[frameIndex](now);
  }
  assert.equal(controller.state.phase, "game-over");
  assert.equal(elements.resultOverlay.hidden, false);
  assert.equal(elements.resultStorageWarning.hidden, false);
  assert.equal(elements.resultStorageWarning.textContent.trim(), "기록을 이 기기에 저장하지 못했습니다.");
  assert.deepEqual(controller.getBestRecord(), { height: 1, walkedSlots: 6 });
  controller.destroy();
});

test("피해 없이 생존하면 UI가 10번째 나무토막 완주와 최종 높이를 알린다", () => {
  const harness = createUiHarness();
  const { controller, elements, scheduledFrames } = harness;
  elements.startButton.emit("click");

  for (let slotIndex = 0; slotIndex < 10; slotIndex += 1) {
    controller.state.currentRock.height = 25;
    clickSlot(elements, slotIndex);
  }

  let now = 0;
  let frameIndex = 0;
  for (; frameIndex < 100 && controller.state.phase !== "camera-transition"; frameIndex += 1) {
    const frame = scheduledFrames[frameIndex];
    assert.equal(typeof frame, "function");
    now += 100;
    frame(now);
  }

  assert.equal(controller.state.phase, "camera-transition");
  assert.equal(controller.state.characterSlot, 9);
  assert.equal(controller.state.walkedSlots, 10);
  assert.equal(controller.state.health, 1113);
  assert.equal(elements.healthValue.textContent, "1113개");
  assert.equal(elements.heightValue.textContent, "25");
  assert.match(elements.gameStatus.textContent, /구간 완주/);

  const completedBoard = [...controller.state.slots];
  elements.canvas.emit("pointerdown", { clientX: 400, clientY: 200 });
  assert.deepEqual(controller.state.slots, completedBoard);
  assert.equal(controller.state.currentRock, null);

  for (; frameIndex < 130 && controller.state.phase !== "placing"; frameIndex += 1) {
    const frame = scheduledFrames[frameIndex];
    assert.equal(typeof frame, "function");
    now += 100;
    frame(now);
  }
  assert.equal(controller.state.phase, "placing");
  assert.equal(controller.state.baseHeight, 25);
  assert.equal(controller.state.currentHeight, 25);
  assert.equal(controller.state.completedSections, 1);
  assert.equal(controller.state.rockSpeedMultiplier, 1.05);
  assert.equal(controller.state.slots.every((height) => height === null), true);
  assert.notEqual(controller.state.currentRock, null);
  assert.equal(controller.state.characterSlot, -1);
  assert.match(elements.gameStatus.textContent, /나무토막/);
  controller.destroy();
});

test("Canvas CSS는 얕은 가로 화면에서도 폭과 높이를 함께 제한하며 16:9를 유지한다", async () => {
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const canvasRule = css.match(/canvas\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? "";

  assert.match(canvasRule, /width:\s*auto/);
  assert.match(canvasRule, /height:\s*auto/);
  assert.match(canvasRule, /max-width:\s*100%/);
  assert.match(canvasRule, /max-height:\s*var\(--canvas-height-budget\)/);
  assert.match(canvasRule, /aspect-ratio:\s*16\s*\/\s*9/);
  assert.match(canvasRule, /margin-inline:\s*auto/);
  assert.match(css, /--canvas-height-budget:\s*calc\(100dvh\s*-\s*64px\)/);
  assert.match(html, /<canvas[\s\S]*?width="1600"[\s\S]*?height="900"/);
});

test("브라우저 진입 모듈은 시작 click부터 실제 Canvas 10칸 렌더와 pointer 배치까지 오류 없이 연결한다", () => {
  const ids = [
    "start-screen",
    "game-screen",
    "start-button",
    "game-canvas",
    "health-value",
    "height-value",
    "game-status",
    "exit-button",
    "restart-button",
    "reset-record-button",
    "result-overlay",
    "result-height",
    "result-walked",
    "result-best-height",
    "result-best-walked",
    "start-best-height",
    "start-best-walked",
    "start-storage-warning",
    "result-storage-warning",
    "start-help-button",
    "game-help-button",
    "tutorial-overlay",
    "tutorial-step-number",
    "tutorial-text",
    "tutorial-next-button",
    "orientation-overlay",
  ];
  const elementsBySelector = new Map(ids.map((id) => [`#${id}`, new FakeEventTarget()]));
  const canvas = elementsBySelector.get("#game-canvas");
  const gameScreen = elementsBySelector.get("#game-screen");
  gameScreen.hidden = true;
  canvas.width = 1600;
  canvas.height = 900;
  canvas.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    right: 1600,
    bottom: 900,
    width: 1600,
    height: 900,
  });

  const drawingCalls = [];
  const drawnTexts = [];
  const gradient = { addColorStop: () => drawingCalls.push("addColorStop") };
  const context = new Proxy(
    {
      createLinearGradient: () => gradient,
      fillText: (value) => {
        drawingCalls.push("fillText");
        drawnTexts.push(String(value));
      },
    },
    {
      get(target, property) {
        if (property in target) {
          return target[property];
        }
        return () => drawingCalls.push(String(property));
      },
      set(target, property, value) {
        target[property] = value;
        return true;
      },
    },
  );
  canvas.getContext = () => context;

  const windowListeners = new Map();
  let frameId = 0;
  const windowRef = {
    devicePixelRatio: 1,
    localStorage: {
      getItem: (key) => (key.includes("tutorial-seen") ? "true" : null),
      setItem: () => {},
      removeItem: () => {},
    },
    confirm: () => false,
    innerWidth: 1600,
    innerHeight: 900,
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame: () => {
      frameId += 1;
      return frameId;
    },
    cancelAnimationFrame: () => {},
    addEventListener: (type, listener) => windowListeners.set(type, listener),
  };
  const documentListeners = new Map();
  const documentRef = {
    hidden: false,
    querySelector: (selector) => elementsBySelector.get(selector),
    addEventListener: (type, listener) => documentListeners.set(type, listener),
  };
  const controller = bootstrapGame(documentRef, windowRef, { now: () => 0 });

  elementsBySelector.get("#start-button").emit("click");
  assert.equal(elementsBySelector.get("#start-screen").hidden, true);
  assert.equal(gameScreen.hidden, false);
  assert.equal(drawingCalls.filter((call) => call === "strokeRect").length, 10);
  assert.equal(drawingCalls.includes("setTransform"), true);
  assert.equal(drawingCalls.includes("clearRect"), true);

  canvas.emit("pointerdown", { clientX: 800, clientY: 450 });
  canvas.emit("pointerdown", { clientX: 800, clientY: 450 });
  assert.equal(controller.state.placementCount, 1);
  assert.equal(controller.state.slots.filter((slot) => slot !== null).length, 1);

  const remainingSlots = [0, 1, 2, 3, 5, 6, 7, 8, 9];
  for (const slotIndex of remainingSlots) {
    controller.state.currentRock.height = slotIndex === 0 ? 50 : slotIndex === 1 ? 1 : 10;
    canvas.emit("pointerdown", {
      clientX: 286 + (slotIndex + 0.5) * 119,
      clientY: 450,
    });
  }
  assert.equal(controller.state.phase, "path-review");
  assert.equal(drawnTexts.includes("-49"), true);
  controller.state.phase = "walking";
  controller.state.lastDamage = 49;
  controller.state.damageEffectRemaining = 0.45;
  controller.render();
  assert.equal(drawnTexts.includes("도토리 -49"), true);
  controller.state.lastDamage = 0;
  controller.state.damageEffectRemaining = 0;
  controller.state.lastHealing = 3;
  controller.state.recoveryEffectRemaining = 0.7;
  controller.render();
  assert.equal(drawnTexts.includes("도토리 +3"), true);
  controller.state.phase = "camera-transition";
  controller.state.baseHeight = 50;
  controller.state.cameraTransitionProgress = 0.5;
  controller.render();
  assert.equal(drawnTexts.includes("높이 50m · 다음 층으로 상승 중"), true);
  assert.equal(windowListeners.has("resize"), true);
  assert.equal(windowListeners.has("pagehide"), true);
  controller.destroy();
});
