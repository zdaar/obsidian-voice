import type { ChapterPlaybackMode } from "../settings/VoiceSettings";

export type ChapterEndAction =
  | { type: "stop" }
  | { type: "replay" }
  | { type: "play"; index: number };

/** Fall back safely when persisted settings are missing, stale, or corrupt. */
export function normalizeChapterPlaybackMode(
  value: unknown,
): ChapterPlaybackMode {
  return value === "continue" ||
    value === "repeat-one" ||
    value === "repeat-all"
    ? value
    : "stop";
}

/**
 * Decide what the player should do when an audio track finishes.
 *
 * Generated/unsaved notes have no chapter index (`-1`), so folder-oriented
 * modes stop rather than unexpectedly starting the first saved chapter.
 */
export function chapterEndAction(
  modeValue: unknown,
  currentIndex: number,
  chapterCount: number,
): ChapterEndAction {
  const mode = normalizeChapterPlaybackMode(modeValue);

  if (mode === "repeat-one") {
    return { type: "replay" };
  }

  if (mode === "stop" || currentIndex < 0 || chapterCount <= 0) {
    return { type: "stop" };
  }

  const nextIndex = currentIndex + 1;
  if (nextIndex < chapterCount) {
    return { type: "play", index: nextIndex };
  }

  if (mode === "repeat-all") {
    return { type: "play", index: 0 };
  }

  return { type: "stop" };
}
