// FR-3 path A: explicit, user-chosen audio capture in the browser. Nothing here records or stores audio.

export type AudioSource = "tab" | "screen" | "microphone";

export type CaptureErrorCode = "unsupported" | "cancelled" | "permission-denied" | "no-audio-track" | "no-device" | "unknown";

export class CaptureError extends Error {
  constructor(public code: CaptureErrorCode, message: string = code) {
    super(message);
  }
}

type TrackLike = { kind: string };
type StreamLike = { getAudioTracks(): TrackLike[]; getTracks(): { stop(): void }[] };

// A display share without audio would otherwise look like a working, silent capture.
export function inspectCapturedStream(stream: StreamLike): { ok: true } | { ok: false; code: "no-audio-track" } {
  return stream.getAudioTracks().length ? { ok: true } : { ok: false, code: "no-audio-track" };
}

export function browserProfile(userAgent: string) {
  const chromium = /Chrome\/|Chromium\/|Edg\//.test(userAgent);
  const mac = /Macintosh|Mac OS X/.test(userAgent);
  const windows = /Windows/.test(userAgent);
  // Chromium reliably shares tab audio everywhere and system audio on Windows (macOS support varies by version);
  // Safari and Firefox share no display audio.
  return { chromium, mac, windows, tabAudio: chromium, systemAudio: chromium && windows };
}

function mapError(error: unknown): CaptureError {
  if (error instanceof CaptureError) return error;
  const name = (error as DOMException)?.name;
  if (name === "NotAllowedError") return new CaptureError("permission-denied");
  if (name === "AbortError") return new CaptureError("cancelled");
  if (name === "NotFoundError" || name === "OverconstrainedError") return new CaptureError("no-device");
  if (name === "NotSupportedError" || name === "TypeError") return new CaptureError("unsupported");
  return new CaptureError("unknown", (error as Error)?.message);
}

// Raw meeting audio: browser voice processing would suppress the remote speaker as "echo".
const RAW_AUDIO: MediaTrackConstraints = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };

export async function requestMeetingAudio(source: AudioSource): Promise<MediaStream> {
  const devices = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
  try {
    if (source === "microphone") {
      if (!devices?.getUserMedia) throw new CaptureError("unsupported");
      return await devices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    }
    if (!devices?.getDisplayMedia) throw new CaptureError("unsupported");
    // Chromium hints: preselect tabs vs. screens, offer the audio checkbox, and keep this page out of the picker.
    const options = {
      video: { displaySurface: source === "tab" ? "browser" : "monitor", frameRate: 1, width: 320 },
      audio: RAW_AUDIO,
      systemAudio: "include",
      selfBrowserSurface: "exclude",
      surfaceSwitching: "include",
      preferCurrentTab: false,
    } as DisplayMediaStreamOptions;
    const stream = await devices.getDisplayMedia(options);
    if (!inspectCapturedStream(stream).ok) {
      stream.getTracks().forEach((track) => track.stop());
      throw new CaptureError("no-audio-track");
    }
    return stream;
  } catch (error) {
    throw mapError(error);
  }
}

export function stopStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((track) => track.stop());
}

// Pausing mutes the track: the share stays visible, but silence is sent to transcription.
export function setStreamPaused(stream: MediaStream | null | undefined, paused: boolean) {
  stream?.getAudioTracks().forEach((track) => { track.enabled = !paused; });
}

export type ErrorHelp = { title: string; message: string; steps: string[] };

export function captureErrorHelp(code: CaptureErrorCode, profile: ReturnType<typeof browserProfile>): ErrorHelp {
  switch (code) {
    case "no-audio-track":
      return {
        title: "That share has no audio",
        message: "The picker returned video only, so there is nothing to transcribe.",
        steps: [
          "Open Teams on the web (teams.microsoft.com) in a Chrome or Edge tab.",
          "Share again, pick that tab, and turn on “Also share tab audio”.",
          profile.mac ? "On macOS, browsers often can't capture audio from the Teams desktop app. Use Teams on the web, or the microphone fallback with speakers." : "Or share your entire screen with “Also share system audio” turned on.",
        ],
      };
    case "unsupported":
      return {
        title: "This browser can't share meeting audio",
        message: profile.chromium ? "Audio capture isn't available on this page. Use http://localhost or HTTPS." : "Safari and Firefox don't share tab or system audio.",
        steps: ["Open this page in Chrome or Edge.", "Or use the microphone fallback with speakers instead of headphones."],
      };
    case "permission-denied":
      return {
        title: "Sharing was blocked",
        message: "The browser or the operating system denied capture permission.",
        steps: profile.mac ? ["On macOS, allow your browser under System Settings → Privacy & Security → Screen & System Audio Recording, then restart the browser.", "Try sharing again."] : ["Allow screen sharing for this site in the address-bar permissions, then try again."],
      };
    case "cancelled":
      return { title: "Sharing was cancelled", message: "No source was selected.", steps: ["Choose “Start sharing audio” again and pick the Teams tab."] };
    case "no-device":
      return { title: "No audio device found", message: "There's no microphone or capture source available.", steps: ["Connect a microphone, or share the Teams web tab instead."] };
    default:
      return { title: "Audio capture failed", message: "Something unexpected stopped the capture.", steps: ["Try again. If it keeps failing, reload the page."] };
  }
}
