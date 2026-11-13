"""Tests for the main (peak) frequency of sound events."""

from types import SimpleNamespace

import numpy as np
import pytest
import xarray as xr
from soundevent import data

import sonari.api.main_frequencies as main_frequencies
from sonari.core.main_frequency import peak_frequency

SAMPLERATE = 256_000
DURATION = 1.0
TASK_START = 2.0


def tone(frequency: float, start: float, end: float, amplitude: float = 1.0) -> np.ndarray:
    """A tone between start and end (seconds into the task), silence elsewhere."""
    t = np.arange(int(DURATION * SAMPLERATE)) / SAMPLERATE
    signal = amplitude * np.sin(2 * np.pi * frequency * t)
    signal[(t < start) | (t >= end)] = 0
    return signal


def wave(signal: np.ndarray) -> xr.DataArray:
    """Audio as load_audio returns it: absolute recording time, a channel dim."""
    times = TASK_START + np.arange(signal.size) / SAMPLERATE
    wav = xr.DataArray(
        signal[:, None],
        dims=("time", "channel"),
        coords={"time": times, "channel": [0]},
        attrs={"samplerate": SAMPLERATE},
    )
    wav.time.attrs["step"] = 1 / SAMPLERATE
    return wav


def sound_event(sea_id: int, geometry) -> SimpleNamespace:
    return SimpleNamespace(id=sea_id, geometry=geometry)


def box(start: float, low: float, end: float, high: float) -> data.BoundingBox:
    """Bounding box with times relative to the task start."""
    return data.BoundingBox(coordinates=[TASK_START + start, low, TASK_START + end, high])


@pytest.fixture
def audio(monkeypatch):
    """Serve the given signal in place of the recording's audio."""

    def serve(signal: np.ndarray):
        monkeypatch.setattr(
            main_frequencies.audio_api,
            "load_audio",
            lambda *args, **kwargs: wave(signal),
        )

    return serve


def compute(sound_events):
    recording = SimpleNamespace(duration=TASK_START + DURATION)
    return main_frequencies.compute_main_frequencies(
        recording, TASK_START, TASK_START + DURATION, sound_events
    )


def test_peak_frequency_interpolates_between_bins():
    frequencies = np.arange(0, 10_000, 250.0)
    # A peak a third of a bin above 5000 Hz
    true_peak = 5000 + 250 / 3
    spectrum = np.exp(-(((frequencies - true_peak) / 400) ** 2))
    assert peak_frequency(spectrum, frequencies) == pytest.approx(true_peak, abs=25)


def test_peak_frequency_of_silence_is_none():
    frequencies = np.arange(0, 10_000, 250.0)
    assert peak_frequency(np.zeros_like(frequencies), frequencies) is None
    assert peak_frequency(np.array([]), np.array([])) is None


def test_main_frequency_of_each_sound_event(audio):
    audio(tone(40_000, 0.1, 0.2) + tone(62_000, 0.5, 0.6))
    result = compute(
        [
            sound_event(1, box(0.1, 30_000, 0.2, 50_000)),
            sound_event(2, box(0.5, 50_000, 0.6, 80_000)),
            # No frequency range: searched in 10 to 110 kHz
            sound_event(3, data.TimeInterval(coordinates=[TASK_START + 0.5, TASK_START + 0.6])),
        ]
    )
    assert result[1] == pytest.approx(40_000, abs=100)
    assert result[2] == pytest.approx(62_000, abs=100)
    assert result[3] == pytest.approx(62_000, abs=100)


def test_main_frequency_stays_inside_the_bounding_box(audio):
    # A louder tone at the same time, outside the box, must not win
    audio(tone(35_000, 0.1, 0.3) + tone(80_000, 0.1, 0.3, amplitude=10))
    result = compute([sound_event(1, box(0.1, 20_000, 0.3, 50_000))])
    assert result[1] == pytest.approx(35_000, abs=100)


def test_main_frequency_of_short_events_and_time_stamps(audio):
    audio(tone(45_000, 0.0, 1.0))
    result = compute(
        [
            # Shorter than a hop
            sound_event(1, box(0.4, 30_000, 0.4005, 60_000)),
            sound_event(2, data.TimeStamp(coordinates=TASK_START + 0.7)),
        ]
    )
    assert result[1] == pytest.approx(45_000, abs=100)
    assert result[2] == pytest.approx(45_000, abs=100)


def test_main_frequency_above_nyquist_is_none(audio):
    audio(tone(45_000, 0.0, 1.0))
    result = compute([sound_event(1, box(0.1, 150_000, 0.3, 200_000))])
    assert result[1] is None
