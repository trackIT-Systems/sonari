#!/usr/bin/env python3
"""Benchmark script for spectrogram generation performance.

This script tests spectrogram computation directly without API overhead.
Run from the back/ directory:
    python benchmark_spectrogram.py
"""

import sys
import time
from pathlib import Path

# Add src to path so we can import sonari modules
sys.path.insert(0, str(Path(__file__).parent / "src"))

from sonari import schemas
from sonari.api import spectrograms as spec_api


def benchmark_single(
    recording_path: Path,
    start_time: float,
    end_time: float,
    samplerate: int = 44100,
    window_size: float = 0.025,
    hop_size: float = 0.5,
    low_res: bool = False,
):
    """Benchmark a single spectrogram computation.
    
    Parameters
    ----------
    recording_path : Path
        Path to audio file
    start_time : float
        Start time in seconds
    end_time : float
        End time in seconds
    samplerate : int
        Expected sample rate
    window_size : float
        FFT window size in SECONDS
    hop_size : float
        Hop size as fraction of window
    low_res : bool
        Whether to use low resolution mode
    """
    # Create a recording schema
    recording = schemas.Recording(
        id=1,
        uuid="00000000-0000-0000-0000-000000000000",
        path=recording_path,
        duration=end_time,  # Approximate
        samplerate=samplerate,
        channels=1,
        time_expansion=1.0,
        hash="test",
        date=None,
        time=None,
        latitude=None,
        longitude=None,
        rights=None,
    )
    
    # Create audio parameters (no filtering/resampling for speed)
    audio_params = schemas.AudioParameters(
        resample=False,
        samplerate=samplerate,
        low_freq=None,
        high_freq=None,
        filter_order=5,
    )
    
    # Create spectrogram parameters
    spec_params = schemas.SpectrogramParameters(
        window_size=window_size,
        hop_size=hop_size,
        window="hann",
        channel=0,
        pcen=False,  # PCEN disabled = True, so False means we use PCEN
        min_dB=-100,
        max_dB=0,
        cmap="viridis",
        normalize=True,
        gamma=1.0,
    )
    
    duration = end_time - start_time
    print(f"\n{'='*70}")
    print(f"Test: {duration:.1f}s audio, window={window_size}, hop={hop_size}, low_res={low_res}")
    print(f"{'='*70}")
    
    # Time the computation
    t_start = time.perf_counter()
    
    try:
        data = spec_api.compute_spectrogram(
            recording,
            start_time,
            end_time,
            audio_params,
            spec_params,
            audio_dir=recording_path.parent,
            low_res=low_res,
        )
        
        t_end = time.perf_counter()
        elapsed_ms = (t_end - t_start) * 1000
        
        print(f"{'='*70}")
        print(f"✓ SUCCESS: {elapsed_ms:.2f}ms total")
        print(f"  Output shape: {data.shape}")
        print(f"  Speed: {duration / (elapsed_ms/1000):.1f}x realtime")
        print(f"{'='*70}\n")
        
        return elapsed_ms, data.shape
        
    except Exception as e:
        t_end = time.perf_counter()
        elapsed_ms = (t_end - t_start) * 1000
        print(f"✗ FAILED after {elapsed_ms:.2f}ms: {e}")
        return None, None


def find_audio_file(audio_dir: Path) -> Path | None:
    """Find the first audio file in the directory."""
    for ext in ["*.wav", "*.WAV", "*.mp3", "*.flac", "*.ogg"]:
        files = list(audio_dir.glob(ext))
        if files:
            return files[0]
    return None


def main():
    """Run benchmark suite."""
    print("="*70)
    print("SPECTROGRAM PERFORMANCE BENCHMARK")
    print("="*70)
    
    # Try to find an audio file
    audio_dir = Path(".")
    if (Path.cwd() / "audio").exists():
        audio_dir = Path.cwd() / "audio"
    
    audio_file = find_audio_file(audio_dir)
    
    if audio_file is None:
        print("\n❌ No audio file found!")
        print("Please provide path to an audio file:")
        print("  python benchmark_spectrogram.py /path/to/audio.wav")
        
        if len(sys.argv) > 1:
            audio_file = Path(sys.argv[1])
            if not audio_file.exists():
                print(f"❌ File not found: {audio_file}")
                return
        else:
            return
    
    print(f"\n📁 Using audio file: {audio_file}")
    print(f"   Size: {audio_file.stat().st_size / 1024 / 1024:.1f} MB")
    
    # Get file info
    import soundfile as sf
    with sf.SoundFile(audio_file) as f:
        duration = len(f) / f.samplerate
        samplerate = f.samplerate
        channels = f.channels
        print(f"   Duration: {duration:.1f}s")
        print(f"   Sample rate: {samplerate} Hz")
        print(f"   Channels: {channels}")
    
    results = []
    
    # Test 1: Short clip (5 seconds)
    if duration >= 5:
        elapsed, shape = benchmark_single(
            audio_file, 0, 5, samplerate,
            window_size=0.025, hop_size=0.5, low_res=False
        )
        if elapsed:
            results.append(("5s clip (normal)", elapsed, shape))
    
    # Test 2: Short clip (5 seconds) - LOW RES
    if duration >= 5:
        elapsed, shape = benchmark_single(
            audio_file, 0, 5, samplerate,
            window_size=0.025, hop_size=0.5, low_res=True
        )
        if elapsed:
            results.append(("5s clip (low-res)", elapsed, shape))
    
    # Test 3: Medium clip (30 seconds)
    if duration >= 30:
        elapsed, shape = benchmark_single(
            audio_file, 0, 30, samplerate,
            window_size=0.025, hop_size=0.5, low_res=False
        )
        if elapsed:
            results.append(("30s clip (normal)", elapsed, shape))
    
    # Test 4: Medium clip (30 seconds) - LOW RES
    if duration >= 30:
        elapsed, shape = benchmark_single(
            audio_file, 0, 30, samplerate,
            window_size=0.025, hop_size=0.5, low_res=True
        )
        if elapsed:
            results.append(("30s clip (low-res)", elapsed, shape))
    
    # Test 5: Larger window size (higher frequency resolution)
    if duration >= 5:
        elapsed, shape = benchmark_single(
            audio_file, 0, 5, samplerate,
            window_size=0.05, hop_size=0.5, low_res=False
        )
        if elapsed:
            results.append(("5s, window=0.05s", elapsed, shape))
    
    # Test 6: Smaller hop size (higher time resolution)
    if duration >= 5:
        elapsed, shape = benchmark_single(
            audio_file, 0, 5, samplerate,
            window_size=0.025, hop_size=0.25, low_res=False
        )
        if elapsed:
            results.append(("5s, hop=0.25", elapsed, shape))
    
    # Print summary
    print("\n" + "="*70)
    print("BENCHMARK SUMMARY")
    print("="*70)
    print(f"{'Test':<30} {'Time (ms)':<15} {'Shape':<20}")
    print("-"*70)
    
    for test_name, elapsed, shape in results:
        print(f"{test_name:<30} {elapsed:>10.2f} ms   {str(shape):<20}")
    
    print("="*70)
    
    # Analysis
    if len(results) >= 2:
        print("\n💡 INSIGHTS:")
        
        # Compare normal vs low-res
        normal_5s = next((r for r in results if r[0] == "5s clip (normal)"), None)
        lowres_5s = next((r for r in results if r[0] == "5s clip (low-res)"), None)
        
        if normal_5s and lowres_5s:
            speedup = normal_5s[1] / lowres_5s[1]
            print(f"   • Low-res mode is {speedup:.1f}x faster than normal")
        
        # Check if performance is acceptable
        if normal_5s:
            time_per_second = normal_5s[1] / 5  # ms per second of audio
            if time_per_second > 100:
                print(f"   ⚠️  Slow: Taking {time_per_second:.0f}ms per second of audio")
                print(f"      Recommendation: Implement caching and/or tile-based rendering")
            elif time_per_second > 50:
                print(f"   ⚡ Moderate: {time_per_second:.0f}ms per second of audio")
                print(f"      Recommendation: Caching would help with user experience")
            else:
                print(f"   ✓ Fast: {time_per_second:.0f}ms per second of audio")
        
        # Compare window sizes
        window_025 = next((r for r in results if "5s clip (normal)" == r[0]), None)
        window_05 = next((r for r in results if "window=0.05s" in r[0]), None)
        
        if window_025 and window_05:
            ratio = window_05[1] / window_025[1]
            print(f"   • Larger window (0.05s) is {ratio:.1f}x slower than default (0.025s)")
    
    print("\n" + "="*70)


if __name__ == "__main__":
    main()

