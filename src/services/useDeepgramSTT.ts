/**
 * useDeepgramSTT — streaming speech-to-text via the server-side Deepgram WebSocket proxy.
 *
 * Falls back to Web Speech API when Deepgram is unavailable (no API key configured
 * server-side) so existing behaviour is preserved for all users.
 *
 * Usage:
 *   const { start, stop, available, listening } = useDeepgramSTT({ lang, onInterim, onFinal });
 *
 * Audio path (Deepgram):
 *   Mic → MediaRecorder (WebM/Opus, 250ms chunks) → WebSocket /api/stt/stream → Deepgram nova-2
 *
 * Transcript events:
 *   - onInterim(text, speaker?)  fires for partial/in-progress speech
 *   - onFinal(text, speaker?)    fires when Deepgram marks an utterance as final (is_final=true)
 *                                speaker is defined when diarize=true; 0 = first speaker (rep)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE } from '../config';
import { apiFetch } from './apiFetch';

const WS_BASE = API_BASE.replace(/^http/, 'ws');

export type DeepgramSTTOptions = {
  lang?: string;
  deviceId?: string;
  diarize?: boolean;
  onInterim?: (text: string, speaker?: number) => void;
  onFinal?: (text: string, speaker?: number) => void;
  onError?: (msg: string) => void;
};

export function useDeepgramSTT({ lang = 'de', deviceId, diarize = false, onInterim, onFinal, onError }: DeepgramSTTOptions = {}) {
  const [available,  setAvailable]  = useState<boolean | null>(null); // null = not yet checked
  const [listening,  setListening]  = useState(false);

  const wsRef            = useRef<WebSocket | null>(null);
  const recorderRef      = useRef<MediaRecorder | null>(null);
  const streamRef        = useRef<MediaStream | null>(null);
  const activeRef        = useRef(false);
  const heartbeatRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPongRef      = useRef<number>(Date.now());
  const chunkSizeRef     = useRef<number>(200); // start with 200ms for low latency, will adapt up
  const pendingChunksRef = useRef<Blob[]>([]); // buffer chunks until WebSocket opens

  // Probe server once to know if Deepgram is configured
  useEffect(() => {
    apiFetch('/stt/available')
      .then((r) => r.ok ? r.json() : { deepgram: false })
      .then((d) => setAvailable(!!d.deepgram))
      .catch(() => setAvailable(false));
  }, []);

  // Extract dominant speaker ID from Deepgram words array (diarize=true mode)
  const parseSpeaker = (words: Array<{ speaker?: number }> = []): number | undefined => {
    const counts: Record<number, number> = {};
    for (const w of words) {
      if (typeof w.speaker === 'number') counts[w.speaker] = (counts[w.speaker] || 0) + 1;
    }
    const top = Object.entries(counts).sort((a, b) => Number(b[1]) - Number(a[1]))[0];
    return top ? Number(top[0]) : undefined;
  };

  // overrideStream — pass a pre-existing MediaStream (e.g. from getDisplayMedia)
  // instead of calling getUserMedia
  const start = useCallback(async (overrideStream?: MediaStream) => {
    if (activeRef.current) return;
    if (!available) return; // caller should use Web Speech API fallback

    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;

    const attemptConnect = async (): Promise<void> => {
      try {
        let stream: MediaStream;
        if (overrideStream) {
          stream = overrideStream;
        } else {
          const audioConstraint: MediaTrackConstraints =
            deviceId && deviceId !== 'default' ? { deviceId: { exact: deviceId } } : {};
          stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraint });
        }
        streamRef.current = stream;

        // START RECORDING IMMEDIATELY — don't wait for WebSocket!
        // This captures audio from the very beginning
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
              // WebSocket is ready, send immediately
              ws.send(e.data);
            } else {
              // WebSocket not ready yet, buffer the chunk
              pendingChunksRef.current.push(e.data);
            }
          }
        };

        // Start recording with small chunks (200ms) for low latency
        chunkSizeRef.current = 200;
        recorder.start(chunkSizeRef.current);

        // NOW open WebSocket (after recording is already started)
        const diarizeParam = diarize ? '&diarize=true' : '';
        const token = sessionStorage.getItem('salez_token') ?? '';
        const wsUrl = `${WS_BASE}/api/stt/stream?token=${encodeURIComponent(token)}&lang=${lang}&codec=webm${diarizeParam}`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        activeRef.current = true;
        setListening(true);
        reconnectAttempts = 0; // reset on successful connection

        ws.onopen = () => {
          // Flush any buffered chunks that arrived before WebSocket opened
          const buffered = pendingChunksRef.current;
          if (buffered.length > 0) {
            for (const chunk of buffered) {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(chunk);
              }
            }
            pendingChunksRef.current = [];
          }

          // Start heartbeat monitoring to detect dead connections + adapt chunk size
          lastPongRef.current = Date.now();
          heartbeatRef.current = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'ping' }));

              // Adaptive chunk sizing based on WebSocket bufferedAmount
              // (higher buffered = network slower = use bigger chunks)
              const buffered = ws.bufferedAmount || 0;
              let newChunkSize = 300; // start at 300ms (was 1000ms)

              if (buffered > 5000) {
                // Network is slow, use larger chunks to reduce overhead
                newChunkSize = 1000;
              } else if (buffered > 2000) {
                newChunkSize = 500;
              } else if (buffered < 500) {
                // Network is fast, use smaller chunks for lower latency
                newChunkSize = 200;
              }

              if (newChunkSize !== chunkSizeRef.current && recorderRef.current) {
                try {
                  recorderRef.current.stop();
                  recorderRef.current.start(newChunkSize);
                  chunkSizeRef.current = newChunkSize;
                } catch {
                  // ignore restart errors
                }
              }

              // Check if we got a pong in the last 35s (heartbeat every 30s)
              if (Date.now() - lastPongRef.current > 35000) {
                onError?.('Verbindung zu Spracherkennung unterbrochen');
                ws.close();
              }
            }
          }, 30000); // ping every 30 seconds
        };

        ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data as string);

            // Handle heartbeat pong
            if (msg.type === 'pong') {
              lastPongRef.current = Date.now();
              return;
            }

            const alt = msg?.channel?.alternatives?.[0];
            if (!alt || !alt.transcript) return;
            const text = alt.transcript.trim();
            if (!text) return;

            const speaker = parseSpeaker(alt.words);

            if (msg.is_final) {
              onFinal?.(text, speaker);
            } else {
              onInterim?.(text, speaker);
            }
          } catch { /* ignore malformed events */ }
        };

        ws.onerror = (err) => {
          const errorMsg = err instanceof ErrorEvent ? err.message : 'Deepgram Verbindungsfehler';
          onError?.(`Spracherkennungsfehler: ${errorMsg}`);
          // Don't stop immediately — try to reconnect
          if (reconnectAttempts < maxReconnectAttempts && activeRef.current) {
            reconnectAttempts++;
            const backoffMs = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 10000);
            setTimeout(() => {
              if (activeRef.current) attemptConnect();
            }, backoffMs);
          } else {
            stop();
          }
        };

        ws.onclose = () => {
          if (activeRef.current && reconnectAttempts < maxReconnectAttempts) {
            // Unexpected close — attempt reconnection with exponential backoff
            reconnectAttempts++;
            const backoffMs = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 10000);
            setTimeout(() => {
              if (activeRef.current) attemptConnect();
            }, backoffMs);
          } else if (activeRef.current) {
            // Max retries exceeded
            activeRef.current = false;
            setListening(false);
            onError?.('Verbindung nach mehreren Versuchen nicht wiederhergestellt');
          }
        };

      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Mikrofon nicht verfügbar';
        onError?.(msg);
        activeRef.current = false;
        setListening(false);
      }
    };

    await attemptConnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available, lang, deviceId, diarize]);

  const stop = useCallback(() => {
    activeRef.current = false;
    setListening(false);

    // Stop heartbeat
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }

    // Clear pending chunks
    pendingChunksRef.current = [];

    // Stop recorder gracefully
    if (recorderRef.current) {
      try {
        if (recorderRef.current.state !== 'inactive') {
          recorderRef.current.stop();
        }
      } catch (e) {
        // ignore if already stopped
      }
      recorderRef.current = null;
    }

    // Only stop mic tracks — display stream tracks are managed by the caller
    if (streamRef.current) {
      try {
        streamRef.current.getAudioTracks().forEach((t) => {
          if (t.readyState === 'live') t.stop();
        });
      } catch (e) {
        // ignore cleanup errors
      }
      streamRef.current = null;
    }

    // Close WebSocket gracefully
    if (wsRef.current) {
      try {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'CloseStream' }));
          // Give server time to process close message before forcefully closing
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
      } catch (e) {
        wsRef.current = null;
      }
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => () => stop(), [stop]);

  return { available, listening, start, stop };
}
