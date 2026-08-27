'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Voice input via the Web Speech API.
 *
 * On-device, no key, no audio leaves the phone. A technician standing at a
 * condenser can say "410A, outdoor 92, suction 118, liquid 325, supply 68,
 * return 78" and the transcript goes through the same extraction path as
 * typed text.
 *
 * Two field realities shape this component:
 *
 *  - Recognition ends on its own after a pause. A technician reading numbers
 *    off a manifold pauses constantly, so we restart automatically until they
 *    stop it, rather than cutting them off mid-list.
 *  - Support is uneven. Where the API is missing, the button is simply not
 *    rendered and the keyboard remains — no broken affordance, no apology.
 */

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [i: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

function getRecognitionConstructor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useVoiceSupported(): boolean {
  const [supported, setSupported] = useState(false);
  useEffect(() => setSupported(getRecognitionConstructor() !== null), []);
  return supported;
}

export function VoiceInput({
  onTranscript,
  disabled,
}: {
  /** Called with the accumulated final transcript when the tech stops. */
  onTranscript: (text: string) => void;
  disabled?: boolean;
}) {
  const supported = useVoiceSupported();
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const finalText = useRef('');
  const wantsToListen = useRef(false);

  const stop = useCallback(() => {
    wantsToListen.current = false;
    recognition.current?.stop();
    setListening(false);
    setInterim('');
    const text = finalText.current.trim();
    finalText.current = '';
    if (text) onTranscript(text);
  }, [onTranscript]);

  const start = useCallback(() => {
    const Ctor = getRecognitionConstructor();
    if (!Ctor) return;

    setError(null);
    finalText.current = '';
    wantsToListen.current = true;

    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';

    rec.onresult = (event) => {
      let pending = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]!;
        if (result.isFinal) finalText.current += `${result[0].transcript} `;
        else pending += result[0].transcript;
      }
      setInterim(pending);
    };

    rec.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setError(
          'Microphone access was denied. Enable it for this site in your browser settings, or type the readings instead.',
        );
        wantsToListen.current = false;
        setListening(false);
      } else if (event.error === 'no-speech') {
        // Normal while reading numbers off a gauge. onend restarts.
      } else if (event.error === 'network') {
        setError('Speech recognition needs a network connection on this browser. Type the readings instead.');
        wantsToListen.current = false;
        setListening(false);
      }
    };

    rec.onend = () => {
      // Recognition stops itself after a pause; a technician reading a list of
      // readings pauses constantly, so keep going until they tap stop.
      if (wantsToListen.current) {
        try {
          rec.start();
        } catch {
          setListening(false);
        }
      } else {
        setListening(false);
      }
    };

    recognition.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setError('Could not start the microphone.');
    }
  }, []);

  useEffect(
    () => () => {
      wantsToListen.current = false;
      recognition.current?.abort();
    },
    [],
  );

  if (!supported) return null;

  return (
    <div className="flex flex-col items-stretch gap-2">
      <button
        type="button"
        onClick={listening ? stop : start}
        disabled={disabled}
        className={`tr-btn ${listening ? 'tr-btn-primary' : 'tr-btn-secondary'}`}
        style={listening ? { background: 'var(--color-alert-500)', color: '#fff' } : undefined}
        aria-pressed={listening}
      >
        <span aria-hidden className={listening ? 'tr-pulse' : ''}>
          {listening ? '⏹' : '🎙'}
        </span>
        {listening ? 'Stop and send' : 'Speak readings'}
      </button>

      {listening && (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }} aria-live="polite">
          {interim || 'Listening — say the readings naturally, e.g. "410A, outdoor 92, suction 118, liquid 325".'}
        </p>
      )}

      {error && (
        <p className="text-xs" style={{ color: 'var(--color-alert-400)' }}>
          {error}
        </p>
      )}
    </div>
  );
}
