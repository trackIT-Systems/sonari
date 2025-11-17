import { useCallback, useMemo, useState, useRef, useEffect } from "react";

import api from "@/app/api";
import useAudioKeyShortcuts from "@/hooks/audio/useAudioKeyShortcuts";

import type { Recording } from "@/types";

export type PlayerControls = {
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  setSpeed: (speed: number) => void;
  setTime: (time: number) => void;
  toggleLoop: () => void;
  togglePlay: () => void;
  toggleAutoplay: () => void;
};

export type SpeedOption = {
  label: string;
  value: number;
};

export type PlayerState = {
  startTime: number;
  endTime: number;
  volume: number;
  currentTime: number;
  speed: number;
  loop: boolean;
  isPlaying: boolean;
  speedOptions: SpeedOption[];
  autoplay: boolean;
};

const LOWEST_SAMPLE_RATE = 8000;
const HIGHTEST_SAMPLE_RATE = 96000;

const ALL_SPEED_OPTIONS: SpeedOption[] = [
  { label: "0.1x", value: 0.1 },
  { label: "0.25x", value: 0.25 },
  { label: "0.5x", value: 0.5 },
  { label: "0.75x", value: 0.75 },
  { label: "1.2x", value: 1.2 },
  { label: "1x", value: 1 },
  { label: "1.5x", value: 1.5 },
  { label: "1.75x", value: 1.75 },
  { label: "2x", value: 2 },
  { label: "3x", value: 3 },
];

function getDefaultSpeedOption(recording: Recording): SpeedOption {
  // If sample rate is above 96000, default to 0.1x, otherwise use 1x
  const defaultSpeed = recording.samplerate > HIGHTEST_SAMPLE_RATE ? 0.1 : 1;
  return ALL_SPEED_OPTIONS.find((option) => option.value === defaultSpeed) || ALL_SPEED_OPTIONS[0];
}

export default function useAudio({
  recording,
  endTime,
  startTime = 0,
  speed: initialSpeed,
  withShortcuts = true,
  withAutoplay,
  onWithAutoplayChange,
}: {
  recording: Recording;
  withShortcuts?: boolean;
  withAutoplay: boolean;
  onWithAutoplayChange: () => void;
} & Partial<PlayerState>): PlayerState & PlayerControls {
  const audio = useRef<HTMLAudioElement>(new Audio());

  const speedOptions = useMemo(() => ALL_SPEED_OPTIONS, []);
  const defaultSpeedOption = useMemo(
    () => getDefaultSpeedOption(recording),
    [recording],
  );

  const [speed, setSpeed] = useState<number>(
    initialSpeed || defaultSpeedOption.value,
  );
  const [time, setTime] = useState<number>(startTime);
  const [loop, setLoop] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(1);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // Store the actual playback bounds (what segment should be played)
  const playbackStartTime = startTime;
  const playbackEndTime = endTime || recording.duration;

  // Full audio URL - download entire recording once
  const fullAudioUrl = useMemo(() => {
    return api.audio.getStreamUrl({
      recording,
      speed: speed,
      // Don't specify startTime/endTime to get the full audio
    });
  }, [recording, speed]);

  const stopAudio = useCallback((audio: HTMLAudioElement, startTime: number) => {
    audio.pause();
    // Don't reset currentTime to 0, reset to the segment start
    audio.currentTime = startTime / speed;
    setTime(startTime);
    setIsPlaying(false);
  }, [speed]);

  // Track when we should stop audio on cleanup (only for recording changes)
  const shouldStopOnCleanup = useRef<boolean>(false);
  const prevFullAudioUrl = useRef<string | undefined>(undefined);
  
  useEffect(() => {
    const { current } = audio;
    
    // Check if this is a recording change (different audio file)
    const isRecordingChange = prevFullAudioUrl.current !== undefined && 
                              prevFullAudioUrl.current !== fullAudioUrl;
    
    // Set flag for cleanup function
    shouldStopOnCleanup.current = isRecordingChange;
    
    // Only update src if it's different (avoids re-download)
    if (current.src !== fullAudioUrl) {
      // Stop current audio before changing source if this is a recording change
      if (isRecordingChange) {
        current.pause();
        setIsPlaying(false);
      }
      
      current.preload = "auto";
      current.src = fullAudioUrl;
      current.load();
    }
    
    current.loop = loop;
    current.volume = volume;
    current.playbackRate = 1; // Speed is handled in the URL
    
    // Seek to the start of our segment
    current.currentTime = playbackStartTime / speed;
    setTime(playbackStartTime);
    
    if (withAutoplay && !isRecordingChange) {
      current.play().then(() => setIsPlaying(true)).catch(() => {});
    }

    // Update the previous URL after processing
    prevFullAudioUrl.current = fullAudioUrl;

    let timer: number;

    const updateTime = () => {
      if (current.paused) return;
      
      // Convert audio currentTime back to actual time considering speed
      const actualCurrentTime = current.currentTime * speed;
      
      // Check if we've reached the end of our segment
      if (actualCurrentTime >= playbackEndTime) {
        // Stop at segment end
        current.pause();
        setIsPlaying(false);
        setTime(playbackStartTime);
        return;
      }
      
      setTime(actualCurrentTime);
      timer = requestAnimationFrame(updateTime);
    };

    timer = requestAnimationFrame(updateTime);

    const onPlay = () => {
      // Ensure we're starting from the right position
      const actualCurrentTime = current.currentTime * speed;
      if (actualCurrentTime < playbackStartTime || actualCurrentTime > playbackEndTime) {
        current.currentTime = playbackStartTime / speed;
        setTime(playbackStartTime);
      }
      timer = requestAnimationFrame(updateTime);
    };

    const onPause = () => {
      cancelAnimationFrame(timer);
    };

    const onError = () => {
      cancelAnimationFrame(timer);
    }

    const onEnded = () => {
      cancelAnimationFrame(timer);
      setIsPlaying(false);
      setTime(playbackStartTime);
    }

    current.addEventListener("play", onPlay);
    current.addEventListener("pause", onPause);
    current.addEventListener("error", onError);
    current.addEventListener("ended", onEnded);

    return () => {
      cancelAnimationFrame(timer);
      current.removeEventListener("play", onPlay);
      current.removeEventListener("pause", onPause);
      current.removeEventListener("error", onError);
      current.removeEventListener("ended", onEnded);
      // Only stop audio during cleanup if this was a recording change
      if (shouldStopOnCleanup.current) {
        current.pause();
        current.currentTime = 0;
        setIsPlaying(false);
      }
    };
  }, [fullAudioUrl, speed, playbackStartTime, playbackEndTime, loop, volume, withAutoplay]);

  // Cleanup audio on component unmount
  useEffect(() => {
    const currentAudio = audio.current;
    return () => {
      // Ensure audio is stopped when component unmounts
      currentAudio.pause();
      currentAudio.currentTime = 0;
    };
  }, []);

  // Some browsers return `Promise` on `.play()` and may throw errors
  // if one tries to execute another `.play()` or `.pause()` while that
  // promise is resolving. So we prevent that with this lock.
  // See: https://bugs.chromium.org/p/chromium/issues/detail?id=593273
  let lockPlay = useRef<boolean>(false);

  const handlePlay = useCallback(() => {
    if (lockPlay.current) return;
    
    // Ensure we start from the segment beginning if we're outside bounds
    const actualCurrentTime = audio.current.currentTime * speed;
    if (actualCurrentTime < playbackStartTime || actualCurrentTime >= playbackEndTime) {
      audio.current.currentTime = playbackStartTime / speed;
    }
    
    const promise = audio.current.play();
    if (promise) {
      lockPlay.current = true;
      promise
        .then(() => {
          setIsPlaying(true);
          lockPlay.current = false;
        })
        .catch(() => {
          lockPlay.current = false;
        });
    } else {
      setIsPlaying(true);
    }
  }, [playbackStartTime, playbackEndTime, speed]);

  const handlePause = useCallback(() => {
    audio.current.pause();
    setIsPlaying(false);
  }, []);

  const handleStop = useCallback(() => {
    stopAudio(audio.current, playbackStartTime);
  }, [playbackStartTime, stopAudio]);

  const handleSetVolume = useCallback((volume: number) => {
    audio.current.volume = volume;
    setVolume(volume);
  }, []);

  const handleSeek = useCallback((time: number) => {
    // Clamp seek time to our playback bounds
    const clampedTime = Math.max(playbackStartTime, Math.min(playbackEndTime, time));
    audio.current.currentTime = clampedTime / speed;
    setTime(clampedTime);
  }, [speed, playbackStartTime, playbackEndTime]);

  const handleTogglePlay = useCallback(() => {
    if (isPlaying) {
      handlePause();
    } else {
      handlePlay();
    }
  }, [isPlaying, handlePlay, handlePause]);

  const handleToggleLoop = useCallback(() => {
    audio.current.loop = !audio.current.loop;
    setLoop(audio.current.loop);
  }, []);

  useAudioKeyShortcuts({
    onTogglePlay: handleTogglePlay,
    enabled: withShortcuts,
  });

  return {
    startTime: playbackStartTime,
    endTime: playbackEndTime,
    volume,
    currentTime: time,
    speed,
    loop,
    isPlaying,
    speedOptions,
    autoplay: withAutoplay,
    toggleAutoplay: onWithAutoplayChange,
    togglePlay: handleTogglePlay,
    play: handlePlay,
    pause: handlePause,
    stop: handleStop,
    setVolume: handleSetVolume,
    toggleLoop: handleToggleLoop,
    seek: handleSeek,
    setSpeed,
    setTime,
  };
}
