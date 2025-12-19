'use client';

import { createContext, useContext, useRef, useCallback, ReactNode } from 'react';

interface AudioContextType {
    registerAudio: (id: string, audio: HTMLAudioElement) => void;
    unregisterAudio: (id: string) => void;
    playAudio: (id: string) => void;
    pauseOthers: (id: string) => void;
}

const AudioPlayerContext = createContext<AudioContextType | null>(null);

export function useAudioPlayer() {
    const context = useContext(AudioPlayerContext);
    if (!context) {
        throw new Error('useAudioPlayer must be used within an AudioPlayerProvider');
    }
    return context;
}

interface AudioPlayerProviderProps {
    children: ReactNode;
}

export function AudioPlayerProvider({ children }: AudioPlayerProviderProps) {
    const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());

    const registerAudio = useCallback((id: string, audio: HTMLAudioElement) => {
        audioRefs.current.set(id, audio);
    }, []);

    const unregisterAudio = useCallback((id: string) => {
        audioRefs.current.delete(id);
    }, []);

    const pauseOthers = useCallback((id: string) => {
        audioRefs.current.forEach((audio, audioId) => {
            if (audioId !== id && !audio.paused) {
                audio.pause();
            }
        });
    }, []);

    const playAudio = useCallback((id: string) => {
        // Pause all other audio first
        pauseOthers(id);

        // Play the requested audio
        const audio = audioRefs.current.get(id);
        if (audio) {
            audio.play().catch(console.error);
        }
    }, [pauseOthers]);

    return (
        <AudioPlayerContext.Provider value={{ registerAudio, unregisterAudio, playAudio, pauseOthers }}>
            {children}
        </AudioPlayerContext.Provider>
    );
}
