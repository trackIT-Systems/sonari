"""Tests for spectrogram and waveform computation with a limited column count."""

from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

import sonari.api.spectrograms as spectrograms_api
from sonari import schemas
from sonari.api.audio import load_audio, select_audio_channel
from sonari.api.spectrograms import compute_spectrogram, compute_waveform

SAMPLERATE = 384_000
DURATION = 4.0
CLICK_TIME = 2.345
CLICK_SAMPLES = 384  # 1 ms


@pytest.fixture
def audio_dir(tmp_path: Path) -> Path:
    """Write a noisy stereo recording with a short loud click in channel 0 only."""
    rng = np.random.default_rng(0)
    samples = int(SAMPLERATE * DURATION)
    data = rng.normal(scale=0.001, size=(samples, 2)).astype(np.float32)
    start = int(CLICK_TIME * SAMPLERATE)
    data[start : start + CLICK_SAMPLES, 0] += 0.5 * np.sin(np.arange(CLICK_SAMPLES) * 0.9)
    sf.write(tmp_path / "click.wav", data, SAMPLERATE)
    return tmp_path


@pytest.fixture
def recording() -> schemas.Recording:
    return schemas.Recording.model_construct(
        id=1,
        path=Path("click.wav"),
        duration=DURATION,
        samplerate=SAMPLERATE,
        channels=2,
        time_expansion=1.0,
    )


def parameters(**kwargs) -> schemas.SpectrogramParameters:
    defaults = {
        "window": "blackmanharris",
        "window_size_samples": 1024,
        "overlap_percent": 96,
        "scale": "dB",
        "clamp": True,
        "min_dB": -140,
        "max_dB": 0,
        "normalize": False,
    }
    return schemas.SpectrogramParameters(**{**defaults, **kwargs})


AUDIO = schemas.AudioParameters()


@pytest.mark.parametrize("max_columns", [7, 120, 900])
def test_pooled_spectrogram_equals_max_pooled_full_resolution(
    monkeypatch, audio_dir, recording, max_columns
):
    """Pooling right after the STFT gives the same image as pooling at the end.

    PCEN smooths across columns, so it is the one step that does not commute
    with pooling; it is disabled here.
    """
    monkeypatch.setattr(spectrograms_api.audio, "pcen", lambda array, **_: array)
    samples = int(DURATION * SAMPLERATE)

    coarse = compute_spectrogram(
        recording, 0, DURATION, AUDIO, parameters(max_columns=max_columns), audio_dir=audio_dir
    )

    # Mirror the hop and pool size chosen by compute_spectrogram
    min_hop = int(np.ceil(samples / max_columns))
    pool = int(np.ceil(min_hop / 512)) if min_hop > 512 else 1
    hop = max(41, int(np.ceil(min_hop / pool)))
    fine = compute_spectrogram(
        recording,
        0,
        DURATION,
        AUDIO,
        parameters(overlap_percent=100 * (1024 - hop) / 1024),
        audio_dir=audio_dir,
    )
    padding = (-fine.shape[1]) % pool
    expected = np.pad(fine, [(0, 0), (0, padding)], constant_values=-np.inf)
    expected = expected.reshape(fine.shape[0], -1, pool).max(axis=-1)

    assert coarse.shape == expected.shape
    np.testing.assert_allclose(coarse, expected, atol=1e-6)


@pytest.mark.parametrize("max_columns", [1, 50, 333, 2000])
def test_spectrogram_column_count_follows_max_columns(audio_dir, recording, max_columns):
    image = compute_spectrogram(
        recording, 0, DURATION, AUDIO, parameters(max_columns=max_columns), audio_dir=audio_dir
    )
    # The padded edges may add one frame
    assert 0.85 * max_columns <= image.shape[1] <= max_columns + 1


def test_spectrogram_keeps_short_click_when_strongly_reduced(audio_dir, recording):
    """A 1 ms click must stay visible, in the right column, at 1/1000 of the columns."""
    image = compute_spectrogram(
        recording, 0, DURATION, AUDIO, parameters(max_columns=100), audio_dir=audio_dir
    )
    loudness = image.max(axis=0)
    expected_column = CLICK_TIME / DURATION * image.shape[1]
    assert abs(int(loudness.argmax()) - expected_column) <= 1.5
    assert loudness.max() - np.median(loudness) > 0.2


def test_spectrogram_unchanged_when_max_columns_exceeds_full_resolution(audio_dir, recording):
    plain = compute_spectrogram(recording, 1, 1.2, AUDIO, parameters(), audio_dir=audio_dir)
    capped = compute_spectrogram(
        recording, 1, 1.2, AUDIO, parameters(max_columns=10**7), audio_dir=audio_dir
    )
    np.testing.assert_array_equal(plain, capped)


@pytest.mark.parametrize(
    "kwargs",
    [
        {"overlap_percent": 10, "max_columns": 20},  # hop already above half a window
        {"overlap_percent": 99, "max_columns": 20},
        {"window_size_samples": 128, "max_columns": 50},
    ],
)
def test_spectrogram_with_max_columns_is_valid(audio_dir, recording, kwargs):
    image = compute_spectrogram(recording, 0.5, 1.5, AUDIO, parameters(**kwargs), audio_dir=audio_dir)
    assert image.ndim == 2
    assert np.isfinite(image).all()
    assert 0 <= image.min() and image.max() <= 1
    assert image.shape[1] <= kwargs["max_columns"] + 1


@pytest.mark.parametrize("max_columns", [1, 64, 500])
def test_waveform_has_exactly_max_columns(audio_dir, recording, max_columns):
    image = compute_waveform(
        recording, 0, DURATION, AUDIO, parameters(max_columns=max_columns), audio_dir=audio_dir
    )
    assert image.shape == (64, max_columns)
    # Every column covers some audio
    assert image.any(axis=0).all()


def test_waveform_click_is_in_the_right_column(audio_dir, recording):
    image = compute_waveform(
        recording, 0, DURATION, AUDIO, parameters(max_columns=400), audio_dir=audio_dir
    )
    heights = image.sum(axis=0)
    expected_column = CLICK_TIME / DURATION * 400
    tallest = np.flatnonzero(heights == heights.max())
    assert np.min(np.abs(tallest - expected_column)) <= 1


def test_waveform_width_without_max_columns_matches_stft_columns(audio_dir, recording):
    image = compute_waveform(recording, 1, 1.5, AUDIO, parameters(), audio_dir=audio_dir)
    hop = 1024 - int(1024 * 96 / 100)
    assert image.shape == (64, int(np.ceil(0.5 / (hop / SAMPLERATE))))


@pytest.mark.parametrize("channel", [0, 1])
def test_select_audio_channel_returns_a_view_of_the_channel(audio_dir, recording, channel):
    wav = load_audio(recording, 0, 0.1, audio_dir=audio_dir, audio_parameters=AUDIO)
    selected = select_audio_channel(wav, parameters(channel=channel))

    assert selected.sizes["channel"] == 1
    np.testing.assert_array_equal(
        selected.isel(channel=0).data, wav.isel(channel=channel).data
    )
    assert np.shares_memory(selected.data, wav.data)


def test_select_audio_channel_falls_back_to_first_channel(audio_dir, recording):
    wav = load_audio(recording, 0, 0.1, audio_dir=audio_dir, audio_parameters=AUDIO)
    selected = select_audio_channel(wav, parameters(channel=5))
    np.testing.assert_array_equal(selected.isel(channel=0).data, wav.isel(channel=0).data)


def test_waveform_columns_span_the_whole_segment(audio_dir, recording):
    """With 1-2 samples per column every column still maps to its own time."""
    # 128 window at 99% overlap is a 2 sample hop; ~3033 samples is not a multiple
    start, end = CLICK_TIME - 0.00395, CLICK_TIME + 0.00395
    image = compute_waveform(
        recording,
        start,
        end,
        AUDIO,
        parameters(window_size_samples=128, overlap_percent=99),
        audio_dir=audio_dir,
    )
    width = image.shape[1]
    assert width == int(np.ceil((end - start) / (2 / SAMPLERATE)))
    # The click starts in the middle of the segment. With 1-2 samples per column a
    # column spans only between its samples, so look for columns far from centre.
    loud = image[:16].any(axis=0) | image[48:].any(axis=0)
    assert abs(int(np.flatnonzero(loud)[0]) - width / 2) <= 2
