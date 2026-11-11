/**
 * Reading an instruction aloud.
 *
 * A recorded narration supplied with the lesson always wins: it is the only way to hear
 * Kinyarwanda, which devices rarely ship a voice for. Otherwise the device's own speech voice is
 * used when it has one for the lesson's language, and the control is hidden when it does not.
 */

export type NarrationFile = { url: string; mime_type: string; metadata: Record<string, unknown> };

/** The recorded narration for a step in a language, if the lesson's asset package has one. */
export function recordedNarration(
  files: NarrationFile[],
  stepCode: string,
  language: string,
): string | null {
  const match = files.find(
    (file) =>
      file.mime_type.startsWith("audio/") &&
      file.metadata.stepCode === stepCode &&
      (file.metadata.language ?? "en") === language,
  );
  return match?.url ?? null;
}

export function speechAvailable(language: string): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  const voices = window.speechSynthesis.getVoices();
  // Before the voice list has loaded, English can be assumed; anything else must be confirmed.
  if (voices.length === 0) return language.startsWith("en");
  return voices.some((voice) => voice.lang.toLowerCase().startsWith(language.toLowerCase()));
}

let playing: HTMLAudioElement | null = null;

export function stopNarration() {
  playing?.pause();
  playing = null;
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

export function narrate(text: string, language: string, recordedUrl: string | null) {
  stopNarration();
  if (recordedUrl) {
    playing = new Audio(recordedUrl);
    void playing.play().catch(() => undefined);
    return;
  }
  if (!speechAvailable(language)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = language;
  utterance.rate = 0.95;
  window.speechSynthesis.speak(utterance);
}
