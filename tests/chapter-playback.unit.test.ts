import {
  chapterEndAction,
  normalizeChapterPlaybackMode,
} from "../src/utils/chapterPlayback";
import { DEFAULT_SETTINGS } from "../src/settings/VoiceSettings";

describe("Unit: chapter playback mode", () => {
  it("stops after one note by default", () => {
    expect(DEFAULT_SETTINGS.chapterPlaybackMode).toBe("stop");
    expect(chapterEndAction("stop", 0, 3)).toEqual({ type: "stop" });
  });

  it("normalizes missing or corrupt persisted modes to stop", () => {
    expect(normalizeChapterPlaybackMode(undefined)).toBe("stop");
    expect(normalizeChapterPlaybackMode("old-repeat-mode")).toBe("stop");
    expect(chapterEndAction("old-repeat-mode", 0, 3)).toEqual({ type: "stop" });
  });

  it("plays the next chapter only in continue mode", () => {
    expect(chapterEndAction("continue", 0, 3)).toEqual({
      type: "play",
      index: 1,
    });
    expect(chapterEndAction("continue", 2, 3)).toEqual({ type: "stop" });
  });

  it("replays the current audio in repeat-one mode", () => {
    expect(chapterEndAction("repeat-one", 1, 3)).toEqual({ type: "replay" });
    expect(chapterEndAction("repeat-one", -1, 0)).toEqual({ type: "replay" });
  });

  it("advances and wraps in repeat-all mode", () => {
    expect(chapterEndAction("repeat-all", 0, 3)).toEqual({
      type: "play",
      index: 1,
    });
    expect(chapterEndAction("repeat-all", 2, 3)).toEqual({
      type: "play",
      index: 0,
    });
  });

  it("never jumps from a generated note into the saved chapter folder", () => {
    expect(chapterEndAction("continue", -1, 3)).toEqual({ type: "stop" });
    expect(chapterEndAction("repeat-all", -1, 3)).toEqual({ type: "stop" });
  });
});
