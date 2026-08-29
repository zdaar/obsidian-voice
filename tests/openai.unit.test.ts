import { requestUrl } from "obsidian";
import { OpenAiSpeechService } from "../src/service/OpenAiSpeechService";
import { createSpeechProvider } from "../src/service/SpeechProviderFactory";
import { DEFAULT_SETTINGS } from "../src/settings/VoiceSettings";

const mockRequestUrl = requestUrl as jest.Mock;

describe("Unit Tests - OpenAI Provider", () => {
  beforeEach(() => {
    mockRequestUrl.mockReset();
  });

  describe("Provider basics", () => {
    test("declares the plain-text input format", () => {
      const service = new OpenAiSpeechService(
        "key",
        "alloy",
        "gpt-4o-mini-tts",
        1.0,
      );
      expect(service.inputFormat).toBe("text");
    });

    test("exposes a non-empty voice catalog", () => {
      const service = new OpenAiSpeechService(
        "key",
        "alloy",
        "gpt-4o-mini-tts",
        1.0,
      );
      expect(service.getVoiceOptions().length).toBeGreaterThan(0);
    });
  });

  describe("Credential validation", () => {
    test("rejects an empty API key without a network call", async () => {
      const service = new OpenAiSpeechService("", "alloy", "tts-1", 1.0);
      const result = await service.validateCredentials();
      expect(result.isValid).toBe(false);
      expect(mockRequestUrl).not.toHaveBeenCalled();
    });

    test("probes the models endpoint and reports the built-in voice count", async () => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        json: { data: [{ id: "gpt-4o-mini-tts" }] },
      });
      const service = new OpenAiSpeechService("key", "alloy", "tts-1", 1.0);
      const result = await service.validateCredentials();
      expect(result.isValid).toBe(true);
      expect(result.voiceCount).toBe(service.getVoiceOptions().length);

      const call = mockRequestUrl.mock.calls[0][0];
      expect(call.url).toContain("/v1/models");
      expect(call.headers.Authorization).toBe("Bearer key");
    });

    test("treats HTTP 401 as an invalid key", async () => {
      mockRequestUrl.mockResolvedValue({ status: 401 });
      const service = new OpenAiSpeechService("bad", "alloy", "tts-1", 1.0);
      const result = await service.validateCredentials();
      expect(result.isValid).toBe(false);
      expect(result.error).toMatch(/invalid/i);
    });
  });

  describe("Synthesis", () => {
    test("calls the speech endpoint with the right URL, headers and body", async () => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        arrayBuffer: new ArrayBuffer(32),
      });

      const service = new OpenAiSpeechService(
        "my-key",
        "nova",
        "gpt-4o-mini-tts",
        1.0,
      );
      await service.speak("Hello world.", 1.0, "note.md");

      expect(mockRequestUrl).toHaveBeenCalledTimes(1);
      const call = mockRequestUrl.mock.calls[0][0];
      expect(call.url).toContain("/v1/audio/speech");
      expect(call.method).toBe("POST");
      expect(call.headers.Authorization).toBe("Bearer my-key");
      const body = JSON.parse(call.body);
      expect(body.input).toBe("Hello world.");
      expect(body.voice).toBe("nova");
      expect(body.model).toBe("gpt-4o-mini-tts");
      expect(body.response_format).toBe("mp3");
      expect(body.instructions).toBeUndefined();

      // Audio should be cached for the active note (download support)
      expect(service.getLastGeneratedAudio("note.md")).not.toBeNull();
    });

    test("sends trimmed speech instructions with GPT-4o mini TTS", async () => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        arrayBuffer: new ArrayBuffer(16),
      });

      const service = new OpenAiSpeechService(
        "key",
        "sage",
        "gpt-4o-mini-tts",
        1.0,
        "  Speak calmly with natural pauses.  ",
      );
      await service.speak("A short passage.");

      const body = JSON.parse(mockRequestUrl.mock.calls[0][0].body);
      expect(body.instructions).toBe("Speak calmly with natural pauses.");
    });

    test("omits unsupported instructions for legacy TTS models", async () => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        arrayBuffer: new ArrayBuffer(16),
      });

      const service = new OpenAiSpeechService(
        "key",
        "alloy",
        "tts-1-hd",
        1.0,
        "Speak dramatically.",
      );
      await service.speak("A short passage.");

      const body = JSON.parse(mockRequestUrl.mock.calls[0][0].body);
      expect(body.instructions).toBeUndefined();
    });

    test("applies instruction and model changes to an existing provider", async () => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        arrayBuffer: new ArrayBuffer(16),
      });

      const service = new OpenAiSpeechService(
        "old-key",
        "alloy",
        "gpt-4o-mini-tts",
        1.0,
      );
      service.updateCredentials({
        ...DEFAULT_SETTINGS,
        OPENAI_API_KEY: "new-key",
        OPENAI_MODEL: "gpt-4o-mini-tts",
        OPENAI_INSTRUCTIONS: "Use a precise teaching style.",
      });
      await service.speak("First passage.");

      let call = mockRequestUrl.mock.calls[0][0];
      expect(call.headers.Authorization).toBe("Bearer new-key");
      expect(JSON.parse(call.body).instructions).toBe(
        "Use a precise teaching style.",
      );

      service.updateCredentials({
        ...DEFAULT_SETTINGS,
        OPENAI_API_KEY: "new-key",
        OPENAI_MODEL: "tts-1",
        OPENAI_INSTRUCTIONS: "This must not be sent.",
      });
      await service.speak("Second passage.");

      call = mockRequestUrl.mock.calls[1][0];
      expect(JSON.parse(call.body).instructions).toBeUndefined();
    });

    test("chunks long text into multiple requests", async () => {
      mockRequestUrl.mockResolvedValue({
        status: 200,
        arrayBuffer: new ArrayBuffer(16),
      });

      // Two paragraphs of ~1500 chars each → exceeds the 2000 char chunk size
      const paragraph = "word ".repeat(300).trim(); // ~1500 chars
      const longText = [paragraph, paragraph].join("\n\n");

      const service = new OpenAiSpeechService(
        "key",
        "alloy",
        "gpt-4o-mini-tts",
        1.0,
        "Keep a consistent audiobook style.",
      );
      await service.speak(longText);

      expect(mockRequestUrl.mock.calls.length).toBeGreaterThan(1);
      for (const [call] of mockRequestUrl.mock.calls) {
        expect(JSON.parse(call.body).instructions).toBe(
          "Keep a consistent audiobook style.",
        );
      }
    });

    test("throws and reports an error when the API key is missing", async () => {
      const service = new OpenAiSpeechService("", "alloy", "tts-1", 1.0);
      const errorCallback = jest.fn();
      service.setErrorCallback(errorCallback);

      await expect(service.speak("Hello")).rejects.toThrow();
      expect(errorCallback).toHaveBeenCalled();
      expect(mockRequestUrl).not.toHaveBeenCalled();
    });

    test("surfaces a friendly message on HTTP 401 during synthesis", async () => {
      mockRequestUrl.mockResolvedValue({ status: 401 });
      const service = new OpenAiSpeechService("bad", "alloy", "tts-1", 1.0);
      const errorCallback = jest.fn();
      service.setErrorCallback(errorCallback);

      await expect(service.speak("Hello")).rejects.toThrow();
      expect(errorCallback).toHaveBeenCalledWith(
        expect.stringMatching(/invalid/i),
      );
    });
  });
});

describe("Unit Tests - Speech Provider Factory (OpenAI)", () => {
  beforeEach(() => {
    mockRequestUrl.mockReset();
  });

  test("defaults instructions when loading pre-feature settings", () => {
    const persistedBeforeFeature = { OPENAI_MODEL: "gpt-4o-mini-tts" };
    const loaded = Object.assign({}, DEFAULT_SETTINGS, persistedBeforeFeature);
    expect(loaded.OPENAI_INSTRUCTIONS).toBe("");
  });

  test("creates a text provider for OpenAI", () => {
    const provider = createSpeechProvider({
      ...DEFAULT_SETTINGS,
      TTS_PROVIDER: "openai",
    });
    expect(provider.inputFormat).toBe("text");
    expect(provider.getVoiceOptions().some((v) => v.id === "alloy")).toBe(true);
  });

  test("passes configured instructions to the OpenAI provider", async () => {
    mockRequestUrl.mockResolvedValue({
      status: 200,
      arrayBuffer: new ArrayBuffer(16),
    });
    const provider = createSpeechProvider({
      ...DEFAULT_SETTINGS,
      TTS_PROVIDER: "openai",
      OPENAI_API_KEY: "key",
      OPENAI_INSTRUCTIONS: "Use a measured documentary style.",
    });

    await provider.speak("Factory-created provider.");

    const body = JSON.parse(mockRequestUrl.mock.calls[0][0].body);
    expect(body.instructions).toBe("Use a measured documentary style.");
  });
});
