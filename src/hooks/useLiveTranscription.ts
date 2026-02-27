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
        transcriptBufferRef.current += `\n${speaker}: ${text}`;

        // Trigger Intelligence based on timing or string length
        const now = Date.now();
        const wordCount = transcriptBufferRef.current.split(' ').length;

        // Fire if 5s passed or 20 words have accumulated in the two-channel buffer
        if (now - lastIntelTimeRef.current > 5000 || wordCount > 20) {
            triggerIntelligence();
            lastIntelTimeRef.current = now;
        }
    };

    const triggerIntelligence = async () => {
        const textToAnalyze = transcriptBufferRef.current.trim();
        transcriptBufferRef.current = ''; // Clear buffer after sending

        if (!textToAnalyze || textToAnalyze.length < 20) return;

        try {
            const res = await fetch('/api/ai/live-intelligence', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    transcript: textToAnalyze,
                    accountId: accountId
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

            const { insight } = data;
            if (insight && insight !== 'Monitoring signal...') {
                addSignal({
                    id: `intel-${Date.now()}`,
                    time: new Date(),
                    type: 'INTEL',
                    message: insight
                });
            }
        } catch (error) {
            console.warn('[Intelligence] Failed to fetch live insight:', error);
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

        setTranscribing(false);
        updateLiveTranscript('');
    };
};
