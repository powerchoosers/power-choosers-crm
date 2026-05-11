import { useEffect, useRef } from 'react';
import { useWarRoomStore } from '../store/warRoomStore';
import { useVoice } from '@/context/VoiceContext';

/**
 * useLiveTranscription
 * Streams microphone audio to AssemblyAI via WebSockets.
 * Pipes results into the War Room signal feed and triggers periodic intelligence.
 */
export const useLiveTranscription = (isActive: boolean, accountId?: string) => {
    const { setTranscribing, updateLiveTranscript, addSignal } = useWarRoomStore();
    const { currentCall } = useVoice();
    const socketAgentRef = useRef<WebSocket | null>(null);
    const socketProspectRef = useRef<WebSocket | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const processorAgentRef = useRef<ScriptProcessorNode | null>(null);
    const processorProspectRef = useRef<ScriptProcessorNode | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const remoteSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const lastIntelTimeRef = useRef<number>(0);
    const transcriptBufferRef = useRef<string>('');

    const rollingWindowRef = useRef<string>('');
    const lastProspectFinalRef = useRef<string>('');
    const lastInsightHashRef = useRef<string>('');
    const inflightIntelRef = useRef(false);
    const lastNonIdleIntelTimeRef = useRef<number>(0);

    const lastDebugTimeRef = useRef<number>(0);

    useEffect(() => {
        if (!isActive) {
            stopStreaming();
            return;
        }

        startStreaming();

        return () => {
            stopStreaming();
        };
    }, [isActive]);

    // Dynamically wire the Twilio incoming audio stream into the processor
    useEffect(() => {
        if (!isActive) return;

        // Poll for the remote stream because Twilio attaches it after call connects
        const interval = setInterval(() => {
            if (!currentCall || !audioContextRef.current || !processorProspectRef.current) return;
            if (remoteSourceNodeRef.current) return; // already wired

            const remoteStream = currentCall.getRemoteStream();
            if (remoteStream && remoteStream.getAudioTracks().length > 0) {
                console.log('[AssemblyAI] Live mixing Twilio prospect stream into transcriber');
                try {
                    const remoteSource = audioContextRef.current.createMediaStreamSource(remoteStream);
                    remoteSource.connect(processorProspectRef.current);
                    remoteSourceNodeRef.current = remoteSource;
                } catch (err) {
                    console.warn('[AssemblyAI] Failed to connect remote audio stream', err);
                }
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [currentCall, isActive]);

    const startStreaming = async () => {
        try {
            // 1. Get Token
            const tokenRes = await fetch('/api/assembly/token');
            const { token } = await tokenRes.json();

            if (!token) throw new Error('No AssemblyAI token received');

            // Generate a WebSocket for either Agent or Prospect
            const setupSocket = (role: 'Agent' | 'Prospect') => {
                const socket = new WebSocket(`wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&format_turns=true&token=${token}`);

                socket.onopen = () => {
                    console.log(`[AssemblyAI] ${role} WebSocket Open`);
                    if (role === 'Agent') {
                        setTranscribing(true);
                        startAudioCapture(); // Only start audio capture once
                    }
                };

                socket.onmessage = (event) => {
                    const data = JSON.parse(event.data);
                    if (data.type === 'Turn') {
                        const transcript = data.transcript || '';
                        if (!transcript) return;

                        if (data.turn_is_formatted) {
                            if (role === 'Prospect') updateLiveTranscript(''); // Clear the partial
                            handleFinalTranscript(transcript, role);
                        } else {
                            if (role === 'Prospect') updateLiveTranscript(transcript); // Only show Prospect in UI
                        }
                    } else if (data.error) {
                        console.error(`[AssemblyAI] ${role} WS Error Message:`, data.error);
                    }
                };

                socket.onerror = (err) => {
                    console.error(`[AssemblyAI] ${role} WebSocket Error:`, err);
                    stopStreaming();
                };

                socket.onclose = () => {
                    console.log(`[AssemblyAI] ${role} WebSocket Closed`);
                    if (role === 'Agent') setTranscribing(false);
                };

                return socket;
            };

            socketAgentRef.current = setupSocket('Agent');
            socketProspectRef.current = setupSocket('Prospect');

        } catch (error) {
            console.error('[AssemblyAI] Initialization Error:', error);
            setTranscribing(false);
        }
    };

    const startAudioCapture = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            audioContextRef.current = audioContext;

            // --- AGENT PIPELINE (Local Mic) ---
            const sourceAgent = audioContext.createMediaStreamSource(stream);
            const processorAgent = audioContext.createScriptProcessor(4096, 1, 1);
            processorAgentRef.current = processorAgent;

            processorAgent.onaudioprocess = (e) => {
                if (socketAgentRef.current?.readyState !== WebSocket.OPEN) return;
                const inputData = e.inputBuffer.getChannelData(0);
                const pcmData = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                    pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
                }
                socketAgentRef.current.send(pcmData.buffer);
            };

            sourceAgent.connect(processorAgent);
            processorAgent.connect(audioContext.destination);

            // --- PROSPECT PIPELINE (Twilio Remote) ---
            const processorProspect = audioContext.createScriptProcessor(4096, 1, 1);
            processorProspectRef.current = processorProspect;

            processorProspect.onaudioprocess = (e) => {
                if (socketProspectRef.current?.readyState !== WebSocket.OPEN) return;
                const inputData = e.inputBuffer.getChannelData(0);
                const pcmData = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                    pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
                }
                socketProspectRef.current.send(pcmData.buffer);
            };

            processorProspect.connect(audioContext.destination);
        } catch (err) {
            console.error('[AssemblyAI] Audio Capture Error:', err);
        }
    };

    const handleFinalTranscript = (text: string, speaker: 'Agent' | 'Prospect') => {
        const line = `${speaker}: ${text}`;
        transcriptBufferRef.current += `\n${line}`;
        rollingWindowRef.current = `${rollingWindowRef.current}\n${line}`.trim();

        // Keep rolling window bounded to reduce token usage while preserving context.
        // Aim for ~2500 chars (a couple minutes of dialogue) as a stable context.
        if (rollingWindowRef.current.length > 2500) {
            rollingWindowRef.current = rollingWindowRef.current.slice(rollingWindowRef.current.length - 2500);
        }

        if (speaker === 'Prospect') {
            lastProspectFinalRef.current = text.trim();
        }

        // Trigger Intelligence based on timing or string length
        const now = Date.now();
        const wordCount = transcriptBufferRef.current.split(' ').length;

        // Premier-grade trigger:
        // - prioritize Prospect final turns (moment-based)
        // - throttle to avoid noise
        // - keep baseline timer/word-count as fallback
        const prospectJustSpoke = speaker === 'Prospect' && text.trim().length >= 6;
        const cooldownMs = 4500;
        const baselineDue = (now - lastIntelTimeRef.current > 7000) || wordCount > 35;

        if (prospectJustSpoke && now - lastIntelTimeRef.current > cooldownMs) {
            triggerIntelligence('prospect_final');
            lastIntelTimeRef.current = now;
        } else if (baselineDue && now - lastIntelTimeRef.current > cooldownMs) {
            triggerIntelligence('baseline');
            lastIntelTimeRef.current = now;
        } else if (prospectJustSpoke) {
            // Diagnostic breadcrumb without spamming.
            if (now - lastDebugTimeRef.current > 20_000) {
                addSignal({
                    id: `live-${Date.now()}`,
                    time: new Date(),
                    type: 'LIVE',
                    message: `Live Insights throttled — Prospect said: "${text.trim().slice(0, 80)}"`
                });
                lastDebugTimeRef.current = now;
            }
        }
    };

    const triggerIntelligence = async (reason: 'prospect_final' | 'baseline') => {
        if (inflightIntelRef.current) {
            const now = Date.now();
            if (now - lastDebugTimeRef.current > 20_000) {
                addSignal({
                    id: `live-${Date.now()}`,
                    time: new Date(),
                    type: 'LIVE',
                    message: 'Live Insights busy — waiting for current analysis to complete'
                });
                lastDebugTimeRef.current = now;
            }
            return;
        }

        const now = Date.now();
        const windowText = rollingWindowRef.current.trim();
        const deltaText = transcriptBufferRef.current.trim();
        transcriptBufferRef.current = '';

        // If we don't have meaningful prospect content, don't spam.
        const lastProspect = lastProspectFinalRef.current;
        if (!windowText || windowText.length < 40) return;

        // Avoid calling the model repeatedly on the same prospect line.
        const fingerprint = `${accountId ?? ''}|${lastProspect}|${windowText.slice(-220)}`;
        if (fingerprint === lastInsightHashRef.current) {
            const now = Date.now();
            if (now - lastDebugTimeRef.current > 25_000 && reason === 'prospect_final') {
                addSignal({
                    id: `live-${Date.now()}`,
                    time: new Date(),
                    type: 'LIVE',
                    message: 'Live Insights dedup — no new prospect signal'
                });
                lastDebugTimeRef.current = now;
            }
            return;
        }
        lastInsightHashRef.current = fingerprint;

        // If nothing changed since last call and we recently produced a non-idle insight, back off.
        if (!deltaText && now - lastNonIdleIntelTimeRef.current < 12_000 && reason === 'baseline') {
            return;
        }

        inflightIntelRef.current = true;

        try {
            const res = await fetch('/api/ai/live-intelligence', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    transcript: windowText,
                    accountId: accountId,
                    contactId: currentCall?.parameters?.contactId || null,
                    reason,
                    lastProspect,
                })
            });

            const data = await res.json();

            if (!res.ok) {
                console.error('[Intelligence] API error:', res.status, data);
                addSignal({
                    id: `intel-err-${Date.now()}`,
                    time: new Date(),
                    type: 'INTEL',
                    message: `⚠ Intelligence error ${res.status} — check server logs`
                });
                return;
            }

            const { insight, insight_json } = data;

            // Basic usefulness heuristic: if model indicates silence, don't keep hammering.
            const moment = typeof insight_json?.moment === 'string' ? insight_json.moment : null;
            const isIdle = moment === 'SILENCE' || moment === 'UNKNOWN';
            if (!isIdle && insight) {
                lastNonIdleIntelTimeRef.current = now;
            }

            if (insight) {
                addSignal({
                    id: `intel-${Date.now()}`,
                    time: new Date(),
                    type: 'INTEL',
                    message: insight
                });
            }
        } catch (error) {
            console.warn('[Intelligence] Failed to fetch live insight:', error);
        } finally {
            inflightIntelRef.current = false;
        }
    };

    const stopStreaming = () => {
        if (socketAgentRef.current) {
            if (socketAgentRef.current.readyState === WebSocket.OPEN) {
                socketAgentRef.current.send(JSON.stringify({ type: 'Terminate' }));
            }
            socketAgentRef.current.close();
            socketAgentRef.current = null;
        }

        if (socketProspectRef.current) {
            if (socketProspectRef.current.readyState === WebSocket.OPEN) {
                socketProspectRef.current.send(JSON.stringify({ type: 'Terminate' }));
            }
            socketProspectRef.current.close();
            socketProspectRef.current = null;
        }

        if (remoteSourceNodeRef.current) {
            remoteSourceNodeRef.current.disconnect();
            remoteSourceNodeRef.current = null;
        }

        if (processorAgentRef.current) {
            processorAgentRef.current.disconnect();
            processorAgentRef.current = null;
        }

        if (processorProspectRef.current) {
            processorProspectRef.current.disconnect();
            processorProspectRef.current = null;
        }

        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }

        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }

        rollingWindowRef.current = '';
        lastProspectFinalRef.current = '';
        lastInsightHashRef.current = '';
        inflightIntelRef.current = false;
        lastNonIdleIntelTimeRef.current = 0;

        setTranscribing(false);
        updateLiveTranscript('');
    };
};
