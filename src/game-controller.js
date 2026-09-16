import {
  advanceCameraTransition,
  advancePlacementAnimations,
  advanceWalk,
  createInitialState,
  placeCurrentRockAtSlot,
  startGame,
} from "./game-state.js";
import {
  EMPTY_BEST_RECORD,
  createBestRecordStore,
  isBetterRecord,
  sanitizeBestRecord,
} from "./record-store.js";
import { createTutorialStore } from "./tutorial-store.js";

export const TUTORIAL_STEPS = Object.freeze([
  "화면 위에 나타난 나무토막의 높이를 확인하세요.",
  "원하는 빈칸을 터치하거나 클릭하면 나무토막이 그 자리에 바로 꽂힙니다.",
  "같거나 높은 칸을 연속으로 지나면 흐름 끝에 가장 큰 도토리 보상을 한 번 얻고, 내리막에서는 높이 차이만큼 떨어뜨립니다.",
]);

export function pointIsInsideElement(element, clientX, clientY) {
  const rect = element.getBoundingClientRect();
  return (
    Number.isFinite(clientX) &&
    Number.isFinite(clientY) &&
    clientX >= rect.left &&
    clientX <= rect.right &&
    clientY >= rect.top &&
    clientY <= rect.bottom
  );
}

export function slotIndexFromCanvasX(canvas, clientX) {
  const rect = canvas.getBoundingClientRect();
  if (!Number.isFinite(clientX) || !Number.isFinite(rect.width) || rect.width <= 0) {
    return null;
  }

  const logicalX = ((clientX - rect.left) / rect.width) * 1600;
  const boardX = 286;
  const boardWidth = 1190;
  if (logicalX < boardX || logicalX > boardX + boardWidth) {
    return null;
  }
  return Math.min(9, Math.floor(((logicalX - boardX) / boardWidth) * 10));
}

export function createGameController({
  elements,
  renderFrame,
  random = Math.random,
  requestFrame = globalThis.requestAnimationFrame,
  cancelFrame = globalThis.cancelAnimationFrame,
  recordStore = createBestRecordStore(null),
  tutorialStore = createTutorialStore(null),
  confirmAction = globalThis.confirm,
  keyboardTarget = null,
}) {
  const {
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
  } = elements;
  const state = createInitialState();
  let previousFrameTime = null;
  let animationFrameId = null;
  let animationGeneration = 0;
  let gameOverHandled = false;
  let tutorialStep = 0;
  let viewportBlocked = false;
  let documentHidden = false;
  const pauseReasons = new Set();
  const loadedBest = recordStore.load();
  const loadedTutorial = tutorialStore.loadSeen();
  let bestRecord = sanitizeBestRecord(loadedBest.record);
  let tutorialSeen = loadedTutorial.seen;

  function setWarning(element, isVisible) {
    element.hidden = !isVisible;
  }

  function updateBestDisplays() {
    startBestHeight.textContent = String(bestRecord.height);
    startBestWalked.textContent = String(bestRecord.walkedSlots);
    resultBestHeight.textContent = String(bestRecord.height);
    resultBestWalked.textContent = String(bestRecord.walkedSlots);
  }

  function stopAnimation() {
    animationGeneration += 1;
    if (animationFrameId !== null) {
      cancelFrame(animationFrameId);
      animationFrameId = null;
    }
  }

  function pauseFor(reason) {
    if (!pauseReasons.has(reason)) {
      pauseReasons.add(reason);
      stopAnimation();
    }
  }

  function resumeFrom(reason) {
    if (!pauseReasons.delete(reason)) {
      return;
    }
    if (pauseReasons.size === 0 && state.screen === "game" && animationIsActive()) {
      previousFrameTime = null;
      scheduleAnimationFrame();
    }
  }

  function scheduleAnimationFrame() {
    if (pauseReasons.size > 0 || animationFrameId !== null || !animationIsActive()) {
      return;
    }
    const scheduledGeneration = animationGeneration;
    animationFrameId = requestFrame((time) => {
      if (scheduledGeneration !== animationGeneration) {
        return;
      }
      animationFrameId = null;
      runFrame(time);
    });
  }

  function updateHud() {
    healthValue.textContent = `${Math.max(0, state.health)}개`;
    healthValue.classList?.toggle("acorn-lost", state.lastDamage > 0);
    heightValue.textContent = String(state.currentHeight);
  }

  function animationIsActive() {
    return (
      state.placementAnimation !== null ||
      (state.currentRock?.spawnProgress ?? 1) < 1 ||
      state.phase === "path-review" ||
      state.phase === "walking" ||
      state.phase === "camera-transition"
    );
  }

  function updatePlacementMessage() {
    const placement = state.lastPlacement;
    if (!placement) {
      return;
    }

    if (state.phase === "path-review") {
      gameStatus.textContent = "길 완성! 위험한 내리막을 확인하세요.";
      canvas.style.cursor = "default";
      return;
    }

    gameStatus.textContent = `${placement.height} 높이 나무토막 배치 · ${state.placementCount}/10`;
  }

  function render() {
    renderFrame(state);
  }

  function renderTutorialStep() {
    tutorialStepNumber.textContent = `${tutorialStep + 1} / ${TUTORIAL_STEPS.length}`;
    tutorialText.textContent = TUTORIAL_STEPS[tutorialStep];
    tutorialNextButton.textContent = tutorialStep === TUTORIAL_STEPS.length - 1 ? "닫고 계속" : "다음";
  }

  function openTutorial() {
    if (!tutorialOverlay.hidden || !resultOverlay.hidden) {
      return false;
    }
    tutorialStep = 0;
    renderTutorialStep();
    tutorialOverlay.hidden = false;
    if (state.screen === "game") {
      gameScreen.inert = true;
      pauseFor("tutorial");
    } else {
      startScreen.inert = true;
    }
    tutorialNextButton.focus?.();
    return true;
  }

  function finishTutorial() {
    tutorialSeen = true;
    const saved = tutorialStore.markSeen();
    tutorialOverlay.hidden = true;
    startScreen.inert = false;
    if (resultOverlay.hidden) {
      gameScreen.inert = false;
    }
    if (!saved) {
      if (state.screen === "game") {
        gameStatus.textContent = "안내 완료를 이 기기에 저장하지 못했습니다. 게임은 계속됩니다.";
      } else {
        setWarning(startStorageWarning, true);
      }
    }
    resumeFrom("tutorial");
  }

  function advanceTutorial() {
    if (tutorialOverlay.hidden) {
      return false;
    }
    if (tutorialStep < TUTORIAL_STEPS.length - 1) {
      tutorialStep += 1;
      renderTutorialStep();
    } else {
      finishTutorial();
    }
    return true;
  }

  function syncEnvironmentPauses() {
    orientationOverlay.hidden = !(state.screen === "game" && viewportBlocked);
    if (state.screen === "game" && viewportBlocked) {
      pauseFor("orientation");
    } else {
      resumeFrom("orientation");
    }
    if (state.screen === "game" && documentHidden) {
      pauseFor("visibility");
    } else {
      resumeFrom("visibility");
    }
  }

  function updateViewport(width, height) {
    viewportBlocked = !Number.isFinite(width) || !Number.isFinite(height) || height > width || width < 600;
    syncEnvironmentPauses();
    return viewportBlocked;
  }

  function setDocumentHidden(isHidden) {
    documentHidden = Boolean(isHidden);
    syncEnvironmentPauses();
  }

  function showGameOverResult() {
    if (gameOverHandled || state.phase !== "game-over") {
      return;
    }

    gameOverHandled = true;
    const currentRecord = { height: state.currentHeight, walkedSlots: state.walkedSlots };
    let saveFailed = false;
    if (isBetterRecord(currentRecord, bestRecord)) {
      bestRecord = currentRecord;
      saveFailed = !recordStore.save(bestRecord);
    }

    updateBestDisplays();
    resultHeight.textContent = String(state.currentHeight);
    resultWalked.textContent = String(state.walkedSlots);
    setWarning(resultStorageWarning, saveFailed);
    resultOverlay.hidden = false;
    gameScreen.inert = true;
    restartButton.focus?.();
  }

  function updateWalkingMessage(previousPhase, previousCharacterSlot) {
    if (previousPhase === "path-review" && state.phase === "walking") {
      gameStatus.textContent = "다람쥐가 완성된 나무 길을 따라 뛰기 시작합니다.";
      return;
    }

    if (state.characterSlot === previousCharacterSlot) {
      return;
    }

    updateHud();
    if (state.phase === "game-over") {
      gameStatus.textContent = `도토리 소진! ${state.characterSlot + 1}번째 나무토막에서 멈췄습니다.`;
    } else if (state.phase === "camera-transition") {
      gameStatus.textContent = `구간 완주! 높이 ${state.baseHeight}m에서 다음 층으로 올라갑니다.`;
    } else if (state.lastDamage > 0) {
      gameStatus.textContent = `도토리 ${state.lastDamage}개를 떨어뜨렸습니다 · 남은 도토리 ${state.health}개`;
    } else if (state.lastHealing > 0) {
      gameStatus.textContent = `안전한 연속 이동 ${state.ascendingStreak}회 완성 · 도토리 +${state.lastHealing}개`;
    } else {
      gameStatus.textContent = `${state.characterSlot + 1}/10 나무토막에 안전하게 착지했습니다.`;
    }
  }

  function runFrame(time) {
    if (previousFrameTime === null) {
      previousFrameTime = time;
    }

    const elapsedSeconds = Math.min((time - previousFrameTime) / 1000, 0.1);
    previousFrameTime = time;
    const placementCountBeforeFrame = state.placementCount;
    const previousPhase = state.phase;
    const previousCharacterSlot = state.characterSlot;
    advancePlacementAnimations(state, elapsedSeconds);
    if (state.phase === "path-review" || state.phase === "walking") {
      advanceWalk(state, elapsedSeconds);
    } else if (state.phase === "camera-transition") {
      advanceCameraTransition(state, elapsedSeconds, random);
    }
    if (state.placementCount !== placementCountBeforeFrame) {
      updatePlacementMessage();
    }
    updateWalkingMessage(previousPhase, previousCharacterSlot);
    if (previousPhase === "camera-transition" && state.phase === "placing") {
      updateHud();
      canvas.style.cursor = "pointer";
      gameStatus.textContent = `${state.completedSections + 1}번째 구간 · 나무토막을 놓을 빈칸을 선택하세요.`;
    }
    showGameOverResult();
    render();

    if (animationIsActive() && pauseReasons.size === 0) {
      scheduleAnimationFrame();
    } else {
      animationFrameId = null;
    }
  }

  function beginGame() {
    if (!startGame(state, random)) {
      return false;
    }

    startScreen.hidden = true;
    gameScreen.hidden = false;
    updateHud();
    gameStatus.textContent = "위의 나무토막을 놓을 빈칸을 선택하세요.";
    resultOverlay.hidden = true;
    gameOverHandled = false;
    previousFrameTime = null;
    render();
    syncEnvironmentPauses();
    if (!tutorialSeen) {
      openTutorial();
    }
    if (pauseReasons.size === 0) {
      scheduleAnimationFrame();
    }
    return true;
  }

  function restartGame() {
    if (state.phase !== "game-over") {
      return false;
    }

    stopAnimation();
    Object.assign(state, createInitialState());
    startGame(state, random);
    startScreen.hidden = true;
    gameScreen.hidden = false;
    resultOverlay.hidden = true;
    gameScreen.inert = false;
    setWarning(resultStorageWarning, false);
    canvas.style.cursor = "pointer";
    gameOverHandled = false;
    previousFrameTime = null;
    updateHud();
    gameStatus.textContent = "새 도전이 시작되었습니다. 나무토막을 놓을 빈칸을 선택하세요.";
    render();
    syncEnvironmentPauses();
    if (pauseReasons.size === 0) {
      scheduleAnimationFrame();
    }
    return true;
  }

  function leaveCurrentGame() {
    if (state.screen !== "game") {
      return false;
    }
    if (!confirmAction("진행 중인 도전을 끝내고 시작 화면으로 나갈까요?")) {
      return false;
    }

    stopAnimation();
    Object.assign(state, createInitialState());
    pauseReasons.clear();
    tutorialOverlay.hidden = true;
    orientationOverlay.hidden = true;
    startScreen.inert = false;
    gameScreen.inert = false;
    resultOverlay.hidden = true;
    gameScreen.hidden = true;
    startScreen.hidden = false;
    gameOverHandled = false;
    previousFrameTime = null;
    updateBestDisplays();
    return true;
  }

  function resetBestRecord() {
    if (state.screen !== "start") {
      return false;
    }
    if (!confirmAction("개인 최고 기록을 초기화할까요? 초기화한 기록은 복원할 수 없습니다.")) {
      return false;
    }

    if (!recordStore.clear()) {
      setWarning(startStorageWarning, true);
      return false;
    }

    bestRecord = { ...EMPTY_BEST_RECORD };
    updateBestDisplays();
    setWarning(startStorageWarning, false);
    return true;
  }

  function handlePlacement(event) {
    if (pauseReasons.size > 0 || !resultOverlay.hidden) {
      return false;
    }
    if (!pointIsInsideElement(canvas, event.clientX, event.clientY)) {
      return false;
    }

    const slotIndex = slotIndexFromCanvasX(canvas, event.clientX);
    if (!placeCurrentRockAtSlot(state, slotIndex, random)) {
      return false;
    }

    updatePlacementMessage();
    render();
    if (animationIsActive()) {
      previousFrameTime = null;
      scheduleAnimationFrame();
    }
    return true;
  }

  function handleResultKeydown(event) {
    if (resultOverlay.hidden) {
      return;
    }
    if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault?.();
      restartButton.focus?.();
    }
  }

  function destroy() {
    startButton.removeEventListener("click", beginGame);
    canvas.removeEventListener("pointerdown", handlePlacement);
    exitButton.removeEventListener("click", leaveCurrentGame);
    restartButton.removeEventListener("click", restartGame);
    resetRecordButton.removeEventListener("click", resetBestRecord);
    startHelpButton.removeEventListener("click", openTutorial);
    gameHelpButton.removeEventListener("click", openTutorial);
    tutorialNextButton.removeEventListener("click", advanceTutorial);
    resultOverlay.removeEventListener("keydown", handleResultKeydown);
    stopAnimation();
  }

  startButton.addEventListener("click", beginGame);
  canvas.addEventListener("pointerdown", handlePlacement);
  exitButton.addEventListener("click", leaveCurrentGame);
  restartButton.addEventListener("click", restartGame);
  resetRecordButton.addEventListener("click", resetBestRecord);
  startHelpButton.addEventListener("click", openTutorial);
  gameHelpButton.addEventListener("click", openTutorial);
  tutorialNextButton.addEventListener("click", advanceTutorial);
  resultOverlay.addEventListener("keydown", handleResultKeydown);
  updateBestDisplays();
  setWarning(startStorageWarning, loadedBest.failed || loadedTutorial.failed);
  setWarning(resultStorageWarning, false);

  return {
    state,
    beginGame,
    handlePlacement,
    restartGame,
    leaveCurrentGame,
    resetBestRecord,
    openTutorial,
    advanceTutorial,
    updateViewport,
    setDocumentHidden,
    render,
    destroy,
    getBestRecord: () => ({ ...bestRecord }),
    getPauseReasons: () => new Set(pauseReasons),
  };
}
