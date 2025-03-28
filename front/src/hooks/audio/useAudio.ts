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
  { label: "1x", value: 1 },
  { label: "0.1x", value: 0.1 },
  { label: "0.25x", value: 0.25 },
  { label: "0.5x", value: 0.5 },
  { label: "0.75x", value: 0.75 },
  { label: "1.2x", value: 1.2 },
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

  // Store internal player state
  const [speed, setSpeed] = useState<number>(
    initialSpeed || defaultSpeedOption.value,
  );
  const [time, setTime] = useState<number>(startTime);
  const [loop, setLoop] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(1);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  const initialUrl = useMemo(() => {
    if (audio.current) {
      audio.current.src = '';
      audio.current.load();
    }
    return api.audio.getStreamUrl({
      recording,
      startTime,
      endTime,
      speed: speed,
    });
  }, [recording, startTime, endTime, speed]);

  const stopAudio = function(audio: HTMLAudioElement, startTime: number) {
      audio.pause();
      audio.currentTime = 0;
      audio.src = '';
      audio.load();
      setTime(startTime);
      setIsPlaying(false);
  }

  useEffect(() => {
    const { current } = audio;
    current.preload = "auto";
    current.src = initialUrl;
    current.loop = loop;
    current.volume = volume;
    current.autoplay = withAutoplay;

    setIsPlaying(withAutoplay ? true : false);
    setTime(startTime);

    let timer: number;

    const updateTime = () => {
      if (current.paused) return;
      const currentTime = current.currentTime * speed + startTime;
      setTime(currentTime);
      timer = requestAnimationFrame(updateTime);
    };

    timer = requestAnimationFrame(updateTime);

    const onPlay = () => {
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
      // set this explicitly to toggle button
      setIsPlaying(false);
      setTime(startTime);
    }

    current.addEventListener("play", onPlay);
    current.addEventListener("pause", onPause);
    current.addEventListener("error", onError);
    current.addEventListener("ended", onEnded);

    return () => {
      cancelAnimationFrame(timer);
      stopAudio(current, startTime);

      current.removeEventListener("play", onPlay);
      current.removeEventListener("pause", onPause);
      current.removeEventListener("error", onError);
      current.removeEventListener("ended", onEnded);
    };
  }, [initialUrl, speed, startTime, loop, volume, withAutoplay]);


  // Some browsers return `Promise` on `.play()` and may throw errors
  // if one tries to execute another `.play()` or `.pause()` while that
  // promise is resolving. So we prevent that with this lock.
  // See: https://bugs.chromium.org/p/chromium/issues/detail?id=593273
  let lockPlay = useRef<boolean>(false);

  const handlePlay = useCallback(() => {
    if (lockPlay.current) return;
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
  }, []);

  const handlePause = useCallback(() => {
    audio.current.pause();
    setIsPlaying(false);
  }, []);

  const handleStop = useCallback(() => {
    stopAudio(audio.current, startTime);
  }, [startTime]);

  const handleSetVolume = useCallback((volume: number) => {
    audio.current.volume = volume;
    setVolume(volume);
  }, []);

  const handleSeek = useCallback((time: number) => {
    audio.current.currentTime = time / speed;
  }, [speed]);

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
    startTime,
    endTime: endTime || recording.duration,
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
