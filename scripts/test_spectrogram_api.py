#!/usr/bin/env python3
"""
Test Script: Frontend → Backend Spectrogram Generation API

This script demonstrates and tests how the frontend accesses the backend
to generate spectrograms with detailed timing information.

Prerequisites:
- Backend server running on http://localhost:5000
- Python 3.10+ with requests library
- At least one recording in the database

Run with: python test_spectrogram_api.py
"""

import sys
import time
from typing import Dict, Any, List, Optional
from urllib.parse import urlencode

import requests

# API Configuration
HOST = "http://localhost:5000"
BASE_URL = f"{HOST}/api/v1"

# Default spectrogram parameters (matching frontend defaults)
DEFAULT_SPECTROGRAM_PARAMETERS = {
    'conf_preset': 'hsr',
    'resample': 'false',
    'scale': 'dB',
    'pcen': 'false',
    'window_size': '0.00319',
    'hop_size': '0.03125',
    'cmap': 'plasma',
    'window': 'blackmanharris',
    'filter_order': '5',
    'normalize': 'false',
    'clamp': 'true',
    'min_dB': '-90',
    'max_dB': '0',
    'channel': '0',
    'gamma': '1.2',
}


class Colors:
    RESET = '\033[0m'
    GREEN = '\033[32m'
    RED = '\033[31m'
    YELLOW = '\033[33m'
    BLUE = '\033[34m'
    CYAN = '\033[36m'
    MAGENTA = '\033[35m'


def log(message: str, color: str = Colors.RESET) -> None:
    """Print colored log message."""
    print(f"{color}{message}{Colors.RESET}")


def log_section(title: str) -> None:
    """Print section header."""
    print('\n' + '=' * 70)
    log(title, Colors.CYAN)
    print('=' * 70)


def log_success(message: str) -> None:
    """Print success message."""
    log(f"✓ {message}", Colors.GREEN)


def log_error(message: str) -> None:
    """Print error message."""
    log(f"✗ {message}", Colors.RED)


def log_info(message: str) -> None:
    """Print info message."""
    log(f"ℹ {message}", Colors.BLUE)


def log_timing(label: str, milliseconds: float) -> None:
    """Print timing information with color based on duration."""
    color = (Colors.GREEN if milliseconds < 1000 else
             Colors.YELLOW if milliseconds < 3000 else Colors.RED)
    log(f"⏱  {label}: {milliseconds:.2f}ms", color)


def authenticate(
    session: requests.Session,
    username: str = "admin",
    password: str = "admin"
) -> bool:
    """
    Authenticate with the backend.
    
    Args:
        session: Requests session to store cookies
        username: Username to login with
        password: Password to login with
        
    Returns:
        True if authentication successful
        
    Raises:
        Exception if authentication fails
    """
    log_section('AUTHENTICATION')
    
    try:
        log_info(f"Logging in as: {username}")
        
        # Login using form data (as per FastAPI Users)
        # CookieTransport returns 204 No Content on successful login
        response = session.post(
            f'{BASE_URL}/auth/login',
            data={
                'username': username,
                'password': password,
            },
        )
        
        # Check for 204 No Content (successful login)
        if response.status_code == 204:
            log_success('Authentication successful')
            # Session automatically stores cookies
            return True
        else:
            response.raise_for_status()
        
    except requests.exceptions.RequestException as error:
        log_error(f"Authentication failed: {error}")
        if hasattr(error, 'response') and error.response is not None:
            log_error(f"Status: {error.response.status_code}")
            log_error(f"Response: {error.response.text if error.response.text else 'No response body'}")
            if error.response.status_code in [400, 403]:
                log('\nPlease ensure you have created a user first:', Colors.YELLOW)
                log('  Option 1: Use pytest fixtures (recommended):', Colors.YELLOW)
                log('  Option 2: Manually insert user into database:', Colors.YELLOW)
                log('    cd back && python scripts/gen_user.py --username admin --password password', Colors.YELLOW)
        raise


def get_test_recording(session: requests.Session) -> Dict[str, Any]:
    """Get a recording to use for testing."""
    log_section('SETUP: Fetching Test Recording')
    
    try:
        response = session.get(
            f'{BASE_URL}/recordings/',
            params={'limit': 1, 'offset': 0}
        )
        response.raise_for_status()
        data = response.json()
        
        if not data.get('items') or len(data['items']) == 0:
            raise ValueError('No recordings found in database. Please add a recording first.')
        
        recording = data['items'][0]
        log_success(f"Found recording: {recording['path']}")
        log_info(f"UUID: {recording['uuid']}")
        log_info(f"Duration: {recording['duration']:.2f}s")
        log_info(f"Samplerate: {recording['samplerate']}Hz")
        log_info(f"Channels: {recording['channels']}")
        
        return recording
        
    except requests.exceptions.RequestException as error:
        log_error(f"Failed to fetch recording: {error}")
        raise


def build_spectrogram_url(
    recording: Dict[str, Any],
    start_time: float,
    end_time: float,
    parameters: Optional[Dict[str, Any]] = None,
    low_res: bool = False
) -> str:
    """Build spectrogram URL (matches frontend API)."""
    params = {
        'recording_uuid': recording['uuid'],
        'start_time': str(start_time),
        'end_time': str(end_time),
        'low_res': str(low_res).lower(),
        **DEFAULT_SPECTROGRAM_PARAMETERS,
        **(parameters or {}),
    }
    
    return f"{BASE_URL}/spectrograms/?{urlencode(params)}"


def test_basic_spectrogram_generation(session: requests.Session, recording: Dict[str, Any]) -> Dict[str, Any]:
    """Test 1: Basic Spectrogram Generation."""
    log_section('TEST 1: Basic Spectrogram Generation')
    
    start_time = 0
    end_time = min(5, recording['duration'])  # First 5 seconds
    
    log_info(f"Requesting spectrogram for time range: {start_time}s - {end_time}s")
    log_info('Using default parameters')
    
    request_start_time = time.time() * 1000
    
    try:
        url = build_spectrogram_url(recording, start_time, end_time)
        log_info(f"URL: {url[:120]}...")
        
        fetch_start = time.time() * 1000
        response = requests.get(url)
        response.raise_for_status()
        fetch_end = time.time() * 1000
        
        log_success('Spectrogram generated successfully')
        
        # Timing information
        total_time = fetch_end - request_start_time
        network_time = fetch_end - fetch_start
        
        log_timing('Total request time', total_time)
        log_timing('Network time', network_time)
        log_timing('Processing time', total_time - network_time)
        
        # Response information
        log_info(f"Content-Type: {response.headers.get('content-type')}")
        log_info(f"Image size: {len(response.content) / 1024:.2f} KB")
        log_info(f"Cache-Control: {response.headers.get('cache-control')}")
        
        return {
            'success': True,
            'timing': {'total_time': total_time, 'network_time': network_time},
            'size': len(response.content),
        }
        
    except requests.exceptions.RequestException as error:
        log_error(f"Failed to generate spectrogram: {error}")
        if hasattr(error, 'response') and error.response is not None:
            log_error(f"Status: {error.response.status_code}")
        raise


def test_custom_parameters(session: requests.Session, recording: Dict[str, Any]) -> Dict[str, Any]:
    """Test 2: Spectrogram with Custom Parameters."""
    log_section('TEST 2: Custom Spectrogram Parameters')
    
    start_time = 0
    end_time = min(3, recording['duration'])
    
    custom_params = {
        'window_size': '0.005',
        'hop_size': '0.05',
        'min_dB': '-100',
        'max_dB': '-10',
        'cmap': 'viridis',
        'normalize': 'true',
    }
    
    log_info('Testing with custom parameters:')
    for key, value in custom_params.items():
        print(f"  {key}: {value}")
    
    request_start_time = time.time() * 1000
    
    try:
        url = build_spectrogram_url(recording, start_time, end_time, custom_params)
        
        response = session.get(url)
        response.raise_for_status()
        
        total_time = (time.time() * 1000) - request_start_time
        
        log_success('Custom spectrogram generated successfully')
        log_timing('Total request time', total_time)
        log_info(f"Image size: {len(response.content) / 1024:.2f} KB")
        
        return {'success': True, 'timing': total_time}
        
    except requests.exceptions.RequestException as error:
        log_error(f"Failed with custom parameters: {error}")
        raise


def test_low_res_vs_high_res(session: requests.Session, recording: Dict[str, Any]) -> Dict[str, Any]:
    """Test 3: Low-Res vs High-Res Comparison."""
    log_section('TEST 3: Low-Res vs High-Res Comparison')
    
    start_time = 0
    end_time = min(10, recording['duration'])  # Longer segment
    
    # Test High-Res
    log_info('Generating HIGH-RES spectrogram...')
    high_res_start = time.time() * 1000
    
    try:
        high_res_url = build_spectrogram_url(recording, start_time, end_time, low_res=False)
        high_res_response = session.get(high_res_url)
        high_res_response.raise_for_status()
        high_res_time = (time.time() * 1000) - high_res_start
        high_res_size = len(high_res_response.content)
        
        log_success('High-res generated')
        log_timing('High-res time', high_res_time)
        log_info(f"High-res size: {high_res_size / 1024:.2f} KB")
        
        # Test Low-Res
        log_info('\nGenerating LOW-RES spectrogram...')
        low_res_start = time.time() * 1000
        
        low_res_url = build_spectrogram_url(recording, start_time, end_time, low_res=True)
        low_res_response = session.get(low_res_url)
        low_res_response.raise_for_status()
        low_res_time = (time.time() * 1000) - low_res_start
        low_res_size = len(low_res_response.content)
        
        log_success('Low-res generated')
        log_timing('Low-res time', low_res_time)
        log_info(f"Low-res size: {low_res_size / 1024:.2f} KB")
        
        # Comparison
        print('\nComparison:')
        time_diff = ((high_res_time - low_res_time) / high_res_time * 100)
        size_diff = ((high_res_size - low_res_size) / high_res_size * 100)
        
        log(f"  Low-res is {time_diff:.1f}% faster", Colors.GREEN)
        log(f"  Low-res is {size_diff:.1f}% smaller", Colors.GREEN)
        
        return {'success': True}
        
    except requests.exceptions.RequestException as error:
        log_error(f"Comparison test failed: {error}")
        raise


def test_multiple_segments(session: requests.Session, recording: Dict[str, Any]) -> Dict[str, Any]:
    """Test 4: Multiple Time Segments Performance."""
    log_section('TEST 4: Multiple Time Segments Performance')
    
    segment_duration = 2  # 2 second segments
    num_segments = min(5, int(recording['duration'] // segment_duration))
    
    log_info(f"Testing {num_segments} segments of {segment_duration}s each")
    
    results = []
    
    for i in range(num_segments):
        start_time = i * segment_duration
        end_time = (i + 1) * segment_duration
        
        log_info(f"\nSegment {i + 1}: {start_time}s - {end_time}s")
        
        request_start = time.time() * 1000
        
        try:
            url = build_spectrogram_url(recording, start_time, end_time)
            response = session.get(url)
            response.raise_for_status()
            
            request_time = (time.time() * 1000) - request_start
            size = len(response.content)
            
            results.append({'segment': i + 1, 'time': request_time, 'size': size})
            
            log_success(f"Generated in {request_time:.2f}ms")
            log_info(f"Size: {size / 1024:.2f} KB")
            
        except requests.exceptions.RequestException as error:
            log_error(f"Segment {i + 1} failed: {error}")
            results.append({'segment': i + 1, 'time': None, 'size': None, 'error': True})
    
    # Statistics
    print('\nSegment Statistics:')
    successful_results = [r for r in results if not r.get('error')]
    
    if successful_results:
        avg_time = sum(r['time'] for r in successful_results) / len(successful_results)
        avg_size = sum(r['size'] for r in successful_results) / len(successful_results)
        
        log_info(f"Average generation time: {avg_time:.2f}ms")
        log_info(f"Average size: {avg_size / 1024:.2f} KB")
        log_info(f"Success rate: {len(successful_results)}/{num_segments}")
    
    return {'success': True, 'results': results}


def test_window_sizes(session: requests.Session, recording: Dict[str, Any]) -> Dict[str, Any]:
    """Test 5: Window Size Impact on Performance."""
    log_section('TEST 5: Window Size Impact on Performance')
    
    start_time = 0
    end_time = min(3, recording['duration'])
    
    window_sizes = [0.002, 0.00319, 0.005, 0.01]
    
    log_info('Testing different window sizes...')
    
    results = []
    
    for window_size in window_sizes:
        log_info(f"\nWindow size: {window_size}s")
        
        request_start = time.time() * 1000
        
        try:
            url = build_spectrogram_url(
                recording, start_time, end_time,
                {'window_size': str(window_size)}
            )
            response = session.get(url)
            response.raise_for_status()
            
            request_time = (time.time() * 1000) - request_start
            size = len(response.content)
            
            results.append({'window_size': window_size, 'time': request_time, 'size': size})
            
            log_success(f"Generated in {request_time:.2f}ms")
            log_info(f"Size: {size / 1024:.2f} KB")
            
        except requests.exceptions.RequestException as error:
            log_error(f"Failed with window size {window_size}: {error}")
            results.append({'window_size': window_size, 'time': None, 'size': None, 'error': True})
    
    # Find fastest
    successful_results = [r for r in results if not r.get('error')]
    if successful_results:
        fastest = min(successful_results, key=lambda r: r['time'])
        print('\nResult:')
        log(f"  Fastest window size: {fastest['window_size']}s ({fastest['time']:.2f}ms)", Colors.GREEN)
    
    return {'success': True, 'results': results}


def test_concurrent_requests(session: requests.Session, recording: Dict[str, Any]) -> Dict[str, Any]:
    """Test 6: Concurrent Spectrogram Requests."""
    log_section('TEST 6: Concurrent Spectrogram Requests')
    
    segment_duration = 2
    num_concurrent = 3
    
    log_info(f"Making {num_concurrent} concurrent requests...")
    
    import concurrent.futures
    
    overall_start = time.time() * 1000
    
    def fetch_segment(i):
        start_time = i * segment_duration
        end_time = min((i + 1) * segment_duration, recording['duration'])
        
        url = build_spectrogram_url(recording, start_time, end_time)
        
        try:
            response = session.get(url)
            response.raise_for_status()
            return {
                'segment': i + 1,
                'size': len(response.content),
                'success': True,
            }
        except requests.exceptions.RequestException as error:
            return {
                'segment': i + 1,
                'error': str(error),
                'success': False,
            }
    
    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=num_concurrent) as executor:
            results = list(executor.map(fetch_segment, range(num_concurrent)))
        
        overall_time = (time.time() * 1000) - overall_start
        
        log_success(f"All {num_concurrent} requests completed")
        log_timing('Total time (concurrent)', overall_time)
        
        for result in results:
            if result['success']:
                log_success(f"Segment {result['segment']}: {result['size'] / 1024:.2f} KB")
            else:
                log_error(f"Segment {result['segment']}: {result['error']}")
        
        avg_time_per_request = overall_time / num_concurrent
        log_info(f"Average time per request: {avg_time_per_request:.2f}ms")
        
        return {'success': True, 'overall_time': overall_time, 'results': results}
        
    except Exception as error:
        log_error(f"Concurrent test failed: {error}")
        raise


def run_tests() -> int:
    """Main test runner."""
    print('\n')
    log('╔══════════════════════════════════════════════════════════════════╗', Colors.CYAN)
    log('║   SONARI SPECTROGRAM GENERATION API TEST SUITE                  ║', Colors.CYAN)
    log('║   Testing Frontend → Backend Integration with Timing            ║', Colors.CYAN)
    log('╚══════════════════════════════════════════════════════════════════╝', Colors.CYAN)
    
    tests_passed = 0
    tests_failed = 0
    overall_start = time.time() * 1000
    
    # Create session for authenticated requests
    session = requests.Session()
    
    try:
        # Authenticate first
        authenticate(session)
        
        # Get test recording
        recording = get_test_recording(session)
        
        # Run all tests
        tests = [
            ('Basic Generation', lambda: test_basic_spectrogram_generation(session, recording)),
            ('Custom Parameters', lambda: test_custom_parameters(session, recording)),
            ('Low-Res vs High-Res', lambda: test_low_res_vs_high_res(session, recording)),
            ('Multiple Segments', lambda: test_multiple_segments(session, recording)),
            ('Window Sizes', lambda: test_window_sizes(session, recording)),
            ('Concurrent Requests', lambda: test_concurrent_requests(session, recording)),
        ]
        
        for test_name, test_fn in tests:
            try:
                test_fn()
                tests_passed += 1
            except Exception as error:
                tests_failed += 1
                log_error(f'Test "{test_name}" failed')
        
    except Exception as error:
        log_error(f"\nTest suite failed: {error}")
        tests_failed += 1
    
    overall_time = (time.time() * 1000) - overall_start
    
    # Summary
    log_section('TEST SUMMARY')
    log(f"Tests Passed: {tests_passed}",
        Colors.GREEN if tests_passed > 0 else Colors.RESET)
    log(f"Tests Failed: {tests_failed}",
        Colors.RED if tests_failed > 0 else Colors.RESET)
    log_timing('Total execution time', overall_time)
    
    if tests_failed == 0:
        log_success('\nAll tests passed! ✨')
    else:
        log_error('\nSome tests failed. Please check the errors above.')
    
    # Frontend usage info
    log_section('FRONTEND USAGE')
    print(f"""
The frontend accesses spectrograms through:

1. Build URL (src/api/spectrograms.ts):
   {Colors.BLUE}const url = api.spectrograms.getUrl({{
     recording,
     segment: {{ min: 0, max: 5 }},
     parameters: {{
       window_size: 0.00319,
       hop_size: 0.03125,
       cmap: 'plasma',
       // ... other parameters
     }}
   }});{Colors.RESET}

2. Fetch Image (src/hooks/spectrogram/useSpectrogramImage.ts):
   {Colors.BLUE}const response = await fetch(url);
   const blob = await response.blob();
   const img = new Image();
   img.src = URL.createObjectURL(blob);{Colors.RESET}

3. Cache (src/utils/spectrogram_cache.ts):
   - Spectrograms are cached to avoid redundant requests
   - Cache uses recording UUID + time range + parameters as key

Backend Processing (src/sonari/api/spectrograms.py):
  1. Load audio segment from file
  2. Compute STFT (Short-Time Fourier Transform)
  3. Apply PCEN (optional denoising)
  4. Convert to dB scale
  5. Normalize to [0, 1]
  6. Apply colormap (via matplotlib/PIL)
  7. Return as PNG image

Performance Tips:
  - Use low_res=true for overview/navigation
  - Cache spectrograms to avoid recomputation
  - Request multiple segments concurrently
  - Smaller window sizes = faster computation
    """)
    
    return 0 if tests_failed == 0 else 1


if __name__ == '__main__':
    sys.exit(run_tests())

