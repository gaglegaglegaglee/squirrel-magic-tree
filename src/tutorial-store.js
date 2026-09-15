export const TUTORIAL_SEEN_STORAGE_KEY = "pyramid-construction.tutorial-seen.v1";

export function createTutorialStore(storage) {
  function loadSeen() {
    if (!storage || typeof storage.getItem !== "function") {
      return { seen: false, failed: true };
    }
    try {
      return { seen: storage.getItem(TUTORIAL_SEEN_STORAGE_KEY) === "true", failed: false };
    } catch {
      return { seen: false, failed: true };
    }
  }

  function markSeen() {
    if (!storage || typeof storage.setItem !== "function") {
      return false;
    }
    try {
      storage.setItem(TUTORIAL_SEEN_STORAGE_KEY, "true");
      return true;
    } catch {
      return false;
    }
  }

  return { loadSeen, markSeen };
}
