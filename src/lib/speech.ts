type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: BrowserSpeechResultEvent) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type BrowserSpeechResultEvent = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
};

type SpeechRecognitionCtor = new () => BrowserSpeechRecognition;

function speechCtor(): SpeechRecognitionCtor | null {
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function browserSpeechAvailable() {
  return typeof window !== "undefined" && Boolean(speechCtor());
}

export function startBrowserTranscription(options: {
  onUpdate: (text: string) => void;
  speaker: () => string;
}) {
  const Ctor = speechCtor();
  if (!Ctor) return null;

  const recognition = new Ctor();
  recognition.lang = "pl-PL";
  recognition.continuous = true;
  recognition.interimResults = true;

  let labeled = "";
  let live = true;

  const emit = (interim = "") => {
    const speaker = options.speaker();
    const liveLine = interim.trim() ? `${speaker}: ${interim.trim()}` : "";
    options.onUpdate([labeled, liveLine].filter(Boolean).join("\n"));
  };

  recognition.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const piece = (event.results[i][0]?.transcript ?? "").trim();
      if (!piece) continue;
      if (event.results[i].isFinal) {
        const line = `${options.speaker()}: ${piece}`;
        labeled = labeled ? `${labeled}\n${line}` : line;
      } else {
        interim += `${piece} `;
      }
    }
    emit(interim);
  };

  recognition.onend = () => {
    if (!live) return;
    try {
      recognition.start();
    } catch {
      /* Chrome throws if start() is called twice */
    }
  };

  recognition.onerror = (event) => {
    if (event.error === "no-speech" || event.error === "aborted") return;
    live = false;
  };

  try {
    recognition.start();
  } catch {
    return null;
  }

  return {
    stop: () => {
      live = false;
      try {
        recognition.stop();
      } catch {
        /* already stopped */
      }
      return labeled.trim();
    },
  };
}
