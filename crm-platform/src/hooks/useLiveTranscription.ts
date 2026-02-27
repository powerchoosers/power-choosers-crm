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
    const socketRef = useRef<WebSocket | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
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
        // If there's an active call and the audio system is running, grab the remote audio
        if (!currentCall || !audioContextRef.current || !processorRef.current) return;

        const remoteStream = currentCall.getRemoteStream();
        if (remoteStream && !remoteSourceNodeRef.current) {
            console.log('[AssemblyAI v3] Live mixing Twilio remote stream into transcriber');
            try {
                const remoteSource = audioContextRef.current.createMediaStreamSource(remoteStream);
                remoteSource.connect(processorRef.current);
                remoteSourceNodeRef.current = remoteSource;
            } catch (err) {
                console.warn('[AssemblyAI v3] Failed to connect remote audio stream', err);
            }
        }

        return () => {
            if (remoteSourceNodeRef.current && processorRef.current) {
                try {
                    remoteSourceNodeRef.current.disconnect(processorRef.current);
                } catch (e) {
                    // Ignore cleanly if it's already gone
                }
                remoteSourceNodeRef.current = null;
            }
        };
    }, [currentCall, isActive]);

    const startStreaming = async () => {
        try {
            // 1. Get Token
            const tokenRes = await fetch('/api/assembly/token');
            const { token } = await tokenRes.json();

            if (!token) throw new Error('No AssemblyAI token received');

            // 2. Setup WebSocket (V3)
            const socket = new WebSocket(`wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&format_turns=true&token=${token}`);
            socketRef.current = socket;

            socket.onopen = () => {
                console.log('[AssemblyAI v3] WebSocket Open');
                setTranscribing(true);
                startAudioCapture();
            };

            socket.onmessage = (event) => {
                const data = JSON.parse(event.data);

                if (data.type === 'Begin') {
                    console.log(`[AssemblyAI v3] Session began: ID=${data.id}`);
                }
                else if (data.type === 'Turn') {
                    const transcript = data.transcript || '';
                    if (!transcript) return;

                    if (data.turn_is_formatted) {
                        updateLiveTranscript(''); // Clear the partial
                        handleFinalTranscript(transcript);
                    } else {
                        updateLiveTranscript(transcript); // Show the partial
                    }
                }
                else if (data.type === 'Termination') {
                    console.log(`[AssemblyAI v3] Session Terminated`);
                }
                else if (data.error) {
                    console.error('[AssemblyAI v3] Error Message:', data.error);
                }
            };

            socket.onerror = (err) => {
                console.error('[AssemblyAI v3] WebSocket Error:', err);
                stopStreaming();
            };

            socket.onclose = () => {
                console.log('[AssemblyAI v3] WebSocket Closed');
                setTranscribing(false);
            };

        } catch (error) {
            console.error('[AssemblyAI v3] Initialization Error:', error);
            setTranscribing(false);
        }
    };

    const startAudioCapture = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            audioContextRef.current = audioContext;

            const source = audioContext.createMediaStreamSource(stream);
            const processor = audioContext.createScriptProcessor(4096, 1, 1);
            processorRef.current = processor;

            processor.onaudioprocess = (e) => {
                if (socketRef.current?.readyState !== WebSocket.OPEN) return;

                const inputData = e.inputBuffer.getChannelData(0);
                const pcmData = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                    pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
                }

                // AssemblyAI v3 accepts raw binary PCM data directly
                socketRef.current.send(pcmData.buffer);
            };

            source.connect(processor);
            processor.connect(audioContext.destination);
        } catch (err) {
            console.error('[AssemblyAI] Audio Capture Error:', err);
        }
    };

    const handleFinalTranscript = (text: string) => {
        // Log to terminal as LIVE signal
        addSignal({
            id: `live-${Date.now()}`,
            time: new Date(),
            type: 'LIVE',
            message: text,
            isLive: true
        });

        transcriptBufferRef.current += ' ' + text;

        // Trigger Intelligence every 20 seconds or every 50 words
        const now = Date.now();
        const wordCount = transcriptBufferRef.current.split(' ').length;

        if (now - lastIntelTimeRef.current > 20000 || wordCount > 50) {
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
        if (socketRef.current) {
            if (socketRef.current.readyState === WebSocket.OPEN) {
                socketRef.current.send(JSON.stringify({ type: 'Terminate' }));
            }
            socketRef.current.close();
            socketRef.current = null;
        }

        if (remoteSourceNodeRef.current) {
            remoteSourceNodeRef.current.disconnect();
            remoteSourceNodeRef.current = null;
        }

        if (processorRef.current) {
            processorRef.current.disconnect();
            processorRef.current = null;
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
