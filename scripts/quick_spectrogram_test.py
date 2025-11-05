#!/usr/bin/env python3
"""Quick spectrogram test - customize and run quickly."""

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "src"))

from sonari import schemas
from sonari.api import spectrograms as spec_api
from sonari.core import images

# ============================================================================
# CUSTOMIZE THESE PARAMETERS - MATCHING PRODUCTION
# ============================================================================
AUDIO_FILE = "/Users/melinamorch/dev/files/N07HB1_20250602_213002.wav"  # Change this!
START_TIME = 0.0
END_TIME = 8.0  # Match production high-res requests
WINDOW_SIZE = 0.0319  # Match production HIGH-RES window (3.19ms)
HOP_SIZE = 0.03125     # Match production
LOW_RES = False  # Match production high-res requests

# ============================================================================

def main():
    audio_path = Path(AUDIO_FILE)
    
    # Allow command line override
    if len(sys.argv) > 1:
        audio_path = Path(sys.argv[1])
    
    if not audio_path.exists():
        print(f"❌ File not found: {audio_path}")
        print("\nPlease edit AUDIO_FILE in the script or provide as argument:")
        print(f"  python {sys.argv[0]} /path/to/audio.wav")
        return
    
    print(f"Testing: {audio_path}")
    print(f"Time range: {START_TIME:.1f}s - {END_TIME:.1f}s")
    print(f"Parameters: window={WINDOW_SIZE}, hop={HOP_SIZE}, low_res={LOW_RES}")
    print("-" * 60)
    
    # Get audio info
    import soundfile as sf
    with sf.SoundFile(audio_path) as f:
        original_samplerate = f.samplerate
        duration = len(f) / f.samplerate
        print(f"Audio: {duration:.1f}s @ {original_samplerate}Hz, {f.channels}ch")
    
    # Match production: no resampling
    use_resample = False
    target_samplerate = original_samplerate
    
    print(f"Matching production settings: resample=false")
    
    # Create schemas
    recording = schemas.Recording(
        id=1,
        uuid="00000000-0000-0000-0000-000000000000",
        path=audio_path,
        duration=duration,
        samplerate=original_samplerate,
        channels=1,
        time_expansion=1.0,
        hash="test",
        date=None,
        time=None,
        latitude=None,
        longitude=None,
        rights=None,
    )
    
    audio_params = schemas.AudioParameters(
        resample=False,  # Match production
        samplerate=original_samplerate,
        filter_order=5,  # Match production
    )
    
    spec_params = schemas.SpectrogramParameters(
        window_size=WINDOW_SIZE,
        hop_size=HOP_SIZE,
        window="blackmanharris",  # Match production
        channel=0,
        pcen=False,  # Match production (pcen=false means PCEN is applied)
        min_dB=-90,  # Match production
        max_dB=0,
        cmap="plasma",  # Match production
        normalize=False,  # Match production
        gamma=1.2,  # Match production
    )
    
    # Run test - FULL PIPELINE matching production
    print("\nRunning FULL pipeline (computation + image conversion + PNG encoding)...")
    print("=" * 60)
    
    t_start = time.perf_counter()
    
    try:
        # 1. Compute spectrogram (numpy array)
        t0 = time.perf_counter()
        data = spec_api.compute_spectrogram(
            recording,
            START_TIME,
            END_TIME,
            audio_params,
            spec_params,
            audio_dir=audio_path.parent,
            low_res=LOW_RES,
        )
        t1 = time.perf_counter()
        compute_ms = (t1 - t0) * 1000
        
        # 2. Normalize (if needed)
        t0 = time.perf_counter()
        if spec_params.normalize:
            data = data / data.max() if data.max() > 0 else data
        t1 = time.perf_counter()
        normalize_ms = (t1 - t0) * 1000
        
        # 3. Convert array to image
        t0 = time.perf_counter()
        image = images.array_to_image(
            data,
            cmap=spec_params.cmap,
            gamma=spec_params.gamma,
        )
        t1 = time.perf_counter()
        array_to_image_ms = (t1 - t0) * 1000
        
        # 4. Thumbnail if low_res
        t0 = time.perf_counter()
        if LOW_RES:
            image.thumbnail((10000, 50))
        t1 = time.perf_counter()
        thumbnail_ms = (t1 - t0) * 1000
        
        # 5. Convert to buffer (PNG encoding - this is what gets sent to browser)
        t0 = time.perf_counter()
        buffer, buffer_size, fmt = images.image_to_buffer(image)
        t1 = time.perf_counter()
        image_to_buffer_ms = (t1 - t0) * 1000
        
        t_end = time.perf_counter()
        total_ms = (t_end - t_start) * 1000
        
        print("=" * 60)
        print(f"✓ SUCCESS - FULL PIPELINE")
        print(f"\n  Breakdown:")
        print(f"    Spectrogram computation: {compute_ms:.2f}ms")
        print(f"    Normalization:          {normalize_ms:.2f}ms")
        print(f"    Array to image:         {array_to_image_ms:.2f}ms")
        print(f"    Thumbnailing:           {thumbnail_ms:.2f}ms")
        print(f"    Image to buffer (PNG):  {image_to_buffer_ms:.2f}ms")
        print(f"  ──────────────────────────────────────")
        print(f"  TOTAL:                  {total_ms:.2f}ms")
        print(f"\n  Output:")
        print(f"    Array shape: {data.shape}")
        print(f"    Image size:  {image.size}")
        print(f"    Buffer size: {buffer_size / 1024:.1f} KB")
        print(f"    Format:      {fmt}")
        print(f"  Speed: {(END_TIME - START_TIME) / (total_ms/1000):.1f}x realtime")
        
        # Performance assessment
        time_per_sec = total_ms / (END_TIME - START_TIME)
        print(f"\n  Performance: {time_per_sec:.1f}ms per second of audio")
        
        if time_per_sec > 300:
            print("  ⚠️  SLOW - Consider optimization")
        elif time_per_sec > 150:
            print("  ⚡ MODERATE - Could be improved")
        else:
            print("  ✓ FAST - Good performance")
        
        # Optionally save to file
        output_path = audio_path.parent / f"{audio_path.stem}_spectrogram.png"
        image.save(output_path)
        print(f"\n💾 Saved spectrogram to: {output_path}")
        
    except Exception as e:
        t_end = time.perf_counter()
        print(f"✗ FAILED: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()

