#!/usr/bin/env python3
"""
Check for Duplicate Dataset Recording Paths

This script checks if there are duplicate dataset_recording paths (or filenames) across all projects/datasets.
A duplicate occurs when the same path (or filename) appears in multiple datasets.

Prerequisites:
- Backend server running
- Python 3.10+ with requests library (pip install requests)
- Valid user credentials

Usage:
  # Check for duplicate full paths
  python scripts/check_duplicate_dataset_recording_paths.py --host http://localhost:5000 --username username --password password

  # Check for duplicate filenames only (not full paths)
  python scripts/check_duplicate_dataset_recording_paths.py --host http://localhost:5000 --username username --password password --filename-only
"""

import argparse
import sys
from collections import defaultdict
from typing import Any, Dict, List, Set

import requests

# Color codes for terminal output
class Colors:
    RESET = '\033[0m'
    GREEN = '\033[32m'
    RED = '\033[31m'
    YELLOW = '\033[33m'
    BLUE = '\033[34m'
    CYAN = '\033[36m'


def log(message: str, color: str = Colors.RESET) -> None:
    """Print colored log message."""
    print(f"{color}{message}{Colors.RESET}")


def log_section(title: str) -> None:
    """Print section header."""
    print('\n' + '=' * 60)
    log(title, Colors.CYAN)
    print('=' * 60)


def log_success(message: str) -> None:
    """Print success message."""
    log(f"✓ {message}", Colors.GREEN)


def log_error(message: str) -> None:
    """Print error message."""
    log(f"✗ {message}", Colors.RED)


def log_info(message: str) -> None:
    """Print info message."""
    log(f"ℹ {message}", Colors.BLUE)


def log_warning(message: str) -> None:
    """Print warning message."""
    log(f"⚠ {message}", Colors.YELLOW)


def authenticate(
    session: requests.Session,
    base_url: str,
    username: str,
    password: str
) -> bool:
    """
    Authenticate with the backend.
    
    Args:
        session: Requests session to store cookies
        base_url: Base URL of the API
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
            f'{base_url}/auth/login',
            data={
                'username': username,
                'password': password,
            },
        )
        
        # Check for 204 No Content (successful login)
        if response.status_code == 204:
            log_success('Authentication successful')
            return True
        else:
            response.raise_for_status()
        
    except requests.exceptions.RequestException as error:
        log_error(f"Authentication failed: {error}")
        if hasattr(error, 'response') and error.response is not None:
            log_error(f"Status: {error.response.status_code}")
            log_error(f"Response: {error.response.text if error.response.text else 'No response body'}")
        raise


def get_all_datasets(
    session: requests.Session,
    base_url: str,
    limit: int = 1000
) -> List[Dict[str, Any]]:
    """
    Get all datasets from the API.
    
    Args:
        session: Authenticated requests session
        base_url: Base URL of the API
        limit: Maximum number of datasets to fetch per page
        
    Returns:
        List of dataset dictionaries
    """
    all_datasets = []
    offset = 0
    
    while True:
        params = {
            'limit': limit,
            'offset': offset,
        }
        
        try:
            response = session.get(
                f'{base_url}/datasets/',
                params=params
            )
            response.raise_for_status()
            
            data = response.json()
            items = data.get('items', [])
            total = data.get('total', 0)
            
            all_datasets.extend(items)
            
            log_info(f"Fetched {len(items)} datasets (total so far: {len(all_datasets)}/{total})")
            
            if len(all_datasets) >= total or len(items) == 0:
                break
                
            offset += limit
            
        except requests.exceptions.RequestException as error:
            log_error(f"Failed to fetch datasets: {error}")
            if hasattr(error, 'response') and error.response is not None:
                log_error(f"Status: {error.response.status_code}")
                log_error(f"Response: {error.response.text if error.response.text else 'No response body'}")
            raise
    
    return all_datasets


def get_dataset_recordings(
    session: requests.Session,
    base_url: str,
    dataset_id: int,
    limit: int = 1000
) -> List[Dict[str, Any]]:
    """
    Get all recordings for a dataset.
    
    Args:
        session: Authenticated requests session
        base_url: Base URL of the API
        dataset_id: Dataset ID
        limit: Maximum number of recordings to fetch per page
        
    Returns:
        List of recording dictionaries
    """
    all_recordings = []
    offset = 0
    
    while True:
        params = {
            'limit': limit,
            'offset': offset,
            'dataset__eq': dataset_id,
        }
        
        try:
            response = session.get(
                f'{base_url}/recordings/',
                params=params
            )
            response.raise_for_status()
            
            data = response.json()
            items = data.get('items', [])
            total = data.get('total', 0)
            
            all_recordings.extend(items)
            
            if len(all_recordings) >= total or len(items) == 0:
                break
                
            offset += limit
            
        except requests.exceptions.RequestException as error:
            log_error(f"Failed to fetch recordings for dataset {dataset_id}: {error}")
            if hasattr(error, 'response') and error.response is not None:
                log_error(f"Status: {error.response.status_code}")
                log_error(f"Response: {error.response.text if error.response.text else 'No response body'}")
            raise
    
    return all_recordings


def calculate_dataset_recording_path(
    recording_path: str,
    dataset_audio_dir: str
) -> str:
    """
    Calculate DatasetRecording.path from recording path and dataset audio_dir.
    
    DatasetRecording.path is recording.path relative to dataset.audio_dir.
    
    Args:
        recording_path: The recording's path (relative to base audio directory)
        dataset_audio_dir: The dataset's audio_dir path
        
    Returns:
        The DatasetRecording.path (recording path relative to dataset audio_dir)
    """
    from pathlib import Path
    
    recording = Path(recording_path)
    audio_dir = Path(dataset_audio_dir)
    
    try:
        # Try to make recording path relative to dataset audio_dir
        # Use try/except for Python < 3.9 compatibility
        try:
            # Python 3.9+ has is_relative_to
            if hasattr(Path, 'is_relative_to') and recording.is_relative_to(audio_dir):
                return str(recording.relative_to(audio_dir))
        except AttributeError:
            pass
        
        # Fallback: try relative_to directly
        try:
            relative = recording.relative_to(audio_dir)
            return str(relative)
        except ValueError:
            # If not relative, check if paths share a common prefix
            # This handles cases where recording might not be in the dataset
            recording_parts = recording.parts
            audio_dir_parts = audio_dir.parts
            
            # Check if audio_dir is a prefix of recording
            if len(recording_parts) >= len(audio_dir_parts):
                if recording_parts[:len(audio_dir_parts)] == audio_dir_parts:
                    # Return the relative part
                    return str(Path(*recording_parts[len(audio_dir_parts):]))
            
            # If not relative, return the recording path as-is
            # This might happen if the recording is not actually in this dataset
            return str(recording)
    except Exception:
        # Ultimate fallback
        return str(recording)


def check_duplicate_dataset_recording_paths(
    session: requests.Session,
    base_url: str,
    datasets: List[Dict[str, Any]],
    filename_only: bool = False
) -> Dict[str, List[Dict[str, Any]]]:
    """
    Check for duplicate DatasetRecording.path values or filenames across datasets.
    
    DatasetRecording.path is the recording path relative to the dataset's audio_dir.
    This function calculates this path for each recording in each dataset and checks
    for duplicates. If filename_only is True, only the filename (not the full path)
    is checked for duplicates.
    
    Args:
        session: Authenticated requests session
        base_url: Base URL of the API
        datasets: List of dataset dictionaries
        filename_only: If True, check only filenames; if False, check full paths
        
    Returns:
        Dictionary mapping DatasetRecording.path (or filename) to list of datasets they appear in
    """
    from pathlib import Path
    
    # Map DatasetRecording.path (or filename) -> list of (dataset_id, dataset_name, recording_id, recording_path)
    dataset_recording_path_to_datasets: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    
    check_type = "FILENAMES" if filename_only else "DATASET_RECORDING PATHS"
    log_section(f'CHECKING FOR DUPLICATE {check_type}')
    log_info(f"Checking {len(datasets)} datasets...")
    
    for dataset in datasets:
        dataset_id = dataset['id']
        dataset_name = dataset['name']
        dataset_audio_dir = dataset.get('audio_dir', '')
        
        log_info(f"Processing dataset: {dataset_name} (ID: {dataset_id})")
        
        try:
            recordings = get_dataset_recordings(session, base_url, dataset_id)
            log_info(f"  Found {len(recordings)} recordings")
            
            for recording in recordings:
                recording_path = recording.get('path', '')
                recording_id = recording.get('id', 0)
                
                # Calculate DatasetRecording.path
                dataset_recording_path = calculate_dataset_recording_path(
                    recording_path,
                    dataset_audio_dir
                )
                
                # Extract filename if filename_only is True
                if filename_only:
                    key = Path(dataset_recording_path).name
                else:
                    key = dataset_recording_path
                
                dataset_recording_path_to_datasets[key].append({
                    'dataset_id': dataset_id,
                    'dataset_name': dataset_name,
                    'recording_id': recording_id,
                    'recording_path': recording_path,
                    'dataset_recording_path': dataset_recording_path,
                    'filename': Path(dataset_recording_path).name,
                })
                
        except Exception as e:
            log_error(f"  Error processing dataset {dataset_name}: {e}")
            continue
    
    return dict(dataset_recording_path_to_datasets)


def main():
    parser = argparse.ArgumentParser(
        description='Check for duplicate dataset_recording paths across all projects',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Check for duplicate full paths on localhost
  python scripts/check_duplicate_dataset_recording_paths.py --host http://localhost:5000 --username admin --password admin

  # Check for duplicate filenames only (not full paths)
  python scripts/check_duplicate_dataset_recording_paths.py --host http://localhost:5000 --username admin --password admin --filename-only

  # Check on production
  python scripts/check_duplicate_dataset_recording_paths.py --host https://your-server.com/sonari --username youruser --password yourpass --filename-only
        """
    )
    
    parser.add_argument(
        '--host',
        type=str,
        default='http://localhost:5000',
        help='Base URL of the backend server (default: http://localhost:5000)'
    )
    parser.add_argument(
        '--username',
        type=str,
        default='admin',
        help='Username for authentication (default: admin)'
    )
    parser.add_argument(
        '--password',
        type=str,
        default='admin',
        help='Password for authentication (default: admin)'
    )
    parser.add_argument(
        '--page-size',
        type=int,
        default=1000,
        help='Page size for API requests (default: 1000)'
    )
    parser.add_argument(
        '--filename-only',
        action='store_true',
        help='Check only filenames (not full paths) for duplicates'
    )
    
    args = parser.parse_args()
    
    base_url = f"{args.host}/api/v1"
    
    # Create session
    session = requests.Session()
    
    try:
        # Authenticate
        authenticate(session, base_url, args.username, args.password)
        
        # Get all datasets
        log_section('FETCHING DATASETS')
        datasets = get_all_datasets(session, base_url, limit=args.page_size)
        log_success(f"Found {len(datasets)} datasets")
        
        if len(datasets) == 0:
            log_warning("No datasets found. Nothing to check.")
            return 0
        
        # Check for duplicates
        dataset_recording_path_to_datasets = check_duplicate_dataset_recording_paths(
            session, base_url, datasets, filename_only=args.filename_only
        )
        
        # Analyze results
        log_section('ANALYSIS')
        
        duplicates = {
            path: datasets_list
            for path, datasets_list in dataset_recording_path_to_datasets.items()
            if len(datasets_list) > 1
        }
        
        total_paths = len(dataset_recording_path_to_datasets)
        duplicate_count = len(duplicates)
        
        check_type = "filenames" if args.filename_only else "DatasetRecording.path values"
        log_info(f"Total unique {check_type}: {total_paths}")
        log_info(f"{'Filenames' if args.filename_only else 'Paths'} appearing in multiple datasets: {duplicate_count}")
        
        if duplicate_count > 0:
            item_type = "filenames" if args.filename_only else "DatasetRecording.path values"
            log_warning(f"\nFound {duplicate_count} duplicate {item_type} across datasets:")
            
            # Sort by number of datasets (most duplicates first)
            sorted_duplicates = sorted(
                duplicates.items(),
                key=lambda x: len(x[1]),
                reverse=True
            )
            
            for key, datasets_list in sorted_duplicates:
                if args.filename_only:
                    log(f"\n  Filename: {key}", Colors.YELLOW)
                else:
                    log(f"\n  DatasetRecording.path: {key}", Colors.YELLOW)
                log(f"  Appears in {len(datasets_list)} dataset(s):", Colors.YELLOW)
                for entry in datasets_list:
                    log(
                        f"    - Dataset '{entry['dataset_name']}' (ID: {entry['dataset_id']}), "
                        f"Recording ID: {entry['recording_id']}",
                        Colors.YELLOW
                    )
                    if args.filename_only:
                        log(
                            f"      Full path: {entry['dataset_recording_path']}, "
                            f"Recording path: {entry['recording_path']}",
                            Colors.YELLOW
                        )
                    else:
                        log(
                            f"      Recording path: {entry['recording_path']}",
                            Colors.YELLOW
                        )
            
            log_section('SUMMARY')
            if args.filename_only:
                log_error(f"⚠ Found {duplicate_count} duplicate filenames across datasets")
                log_warning("\nNote: This checks if the same filename (not full path) appears in multiple datasets.")
                log_warning("Different datasets may have the same filename in different directory structures.")
            else:
                log_error(f"⚠ Found {duplicate_count} duplicate DatasetRecording.path values across datasets")
                log_warning("\nNote: DatasetRecording.path is the recording path relative to the dataset's audio_dir.")
                log_warning("Duplicates indicate the same relative path exists in multiple datasets.")
            return 1
        else:
            if args.filename_only:
                log_success("\n✓ No duplicate filenames found across datasets")
                log_info("\nNote: This checks if the same filename (not full path) appears in multiple datasets.")
            else:
                log_success("\n✓ No duplicate DatasetRecording.path values found across datasets")
                log_info("\nNote: DatasetRecording.path is the recording path relative to the dataset's audio_dir.")
            return 0
            
    except KeyboardInterrupt:
        log_warning("\nCheck interrupted by user")
        return 1
    except Exception as e:
        log_error(f"\nUnexpected error: {e}")
        import traceback
        traceback.print_exc()
        return 1
    finally:
        session.close()


if __name__ == '__main__':
    sys.exit(main())
