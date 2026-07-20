/**
 * useOpenAIWhisper — streaming speech-to-text via OpenAI Whisper API
 *
 * Captures audio from microphone and streams to backend /api/whisper/stream
 * which forwards to OpenAI Whisper model for transcription.
 *
 * Usage:
 *   const { start, stop, available, listening } = useOpenAIWhisper({ lang, onInterim, onFinal });
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE } from '../config';

const WS_BASE = API_BASE.replace(/^http/, 'ws');

export type OpenAIWhisperOptions = {
  lang?: string;
  onInterim?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (msg: string) => void;
};

export function useOpenAIWhisper({ lang = 'de', onInterim, onFinal, onError }: OpenAIWhisperOptions = {}) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const activeRef = useRef(false);
  const chunkSizeRef = useRef<number>(200);
  const pendingChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    // Check if Whisper is available on server
    fetch(`${API_BASE}/whisper/available`)
      .then((r) => r.ok ? r.json() : { whisper: false })
      .then((d) => setAvailable(!!d.whisper))
      .catch(() => setAvailable(false));
  }, []);

  const start = useCallback(async (overrideStream?: MediaStream) => {
    if (activeRef.current) return;
    if (!available) return;

    try {
      let stream: MediaStream;
      if (overrideStream) {
        stream = overrideStream;
      } else {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const audioStream = new MediaStream(stream.getAudioTracks());
      const recorder = new MediaRecorder(audioStream, { mimeType });
      recorderRef.current = recorder;
      pendingChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          const ws = wsRef.current;
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(e.data);
          } else {
            pendingChunksRef.current.push(e.data);
          }
        }
      };

      chunkSizeRef.current = 200;
      recorder.start(chunkSizeRef.current);

      const token = sessionStorage.getItem('salez_token') ?? '';
      const wsUrl = `${WS_BASE}/api/whisper/stream?token=${encodeURIComponent(token)}&lang=${lang}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      activeRef.current = true;
      setListening(true);

      ws.onopen = () => {
        const buffered = pendingChunksRef.current;
        if (buffered.length > 0) {
          for (const chunk of buffered) {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(chunk);
            }
          }
          pendingChunksRef.current = [];
        }
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data as string);

          if (msg.type === 'interim' && msg.text) {
            onInterim?.(msg.text);
          } else if (msg.type === 'final' && msg.text) {
            onFinal?.(msg.text);
          }
        } catch {
          // ignore malformed events
        }
      };

      ws.onerror = () => {
        onError?.('Spracherkennungsfehler');
        stop();
      };

      ws.onclose = () => {
        activeRef.current = false;
        setListening(false);
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Mikrofon nicht verfügbar';
      onError?.(msg);
      activeRef.current = false;
      setListening(false);
    }
  }, [available, lang]);

  const stop = useCallback(() => {
    activeRef.current = false;
    setListening(false);

    if (recorderRef.current) {
      try {
        if (recorderRef.current.state !== 'inactive') {
          recorderRef.current.stop();
        }
      } catch {
        // ignore
      }
      recorderRef.current = null;
    }

    if (streamRef.current) {
      try {
        streamRef.current.getAudioTracks().forEach((t) => {
          if (t.readyState === 'live') t.stop();
        });
      } catch {
        // ignore
      }
      streamRef.current = null;
    }

    if (wsRef.current) {
      try {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'CloseStream' }));
          setTimeout(() => {
            if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
              wsRef.current.close();
            }
            wsRef.current = null;
          }, 500);
        } else {
          wsRef.current.close();
          wsRef.current = null;
        }
      } catch {
        wsRef.current = null;
      }
    }

    pendingChunksRef.current = [];
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { available, listening, start, stop };
}
