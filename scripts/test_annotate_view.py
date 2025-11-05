#!/usr/bin/env python3
"""
Test Script: Frontend → Backend Annotation Projects API

This script demonstrates and tests how the frontend accesses annotation projects
from the backend. It mimics the behavior of the frontend API layer using Python.
It also includes performance timing and can be run multiple times to collect
comprehensive timing data.

Prerequisites:
- Backend server running on http://localhost:5000
- Python 3.10+ with requests library (pip install requests)

Usage:
  # Run tests once (default)
  python test_annotation_projects_api.py
  
  # Run tests 5 times and append all logs to CSV
  python test_annotation_projects_api.py --runs 5
  
  # Run tests 10 times with custom CSV filename
  python test_annotation_projects_api.py --runs 10 --output my_logs.csv
  
  # See all options
  python test_annotation_projects_api.py --help

Output:
  Creates a CSV file with columns:
  - run_number: The run iteration number
  - timestamp: ISO timestamp of when the run started
  - operation: The type of operation performed
  - project_uuid: The project UUID (or 'N/A' for general operations)
  - time_seconds: Time taken in seconds
"""

import argparse
import csv
from datetime import datetime
import json
import os
import sys
import time
from typing import Any, Dict, List, Optional

import requests

# Configuration matching frontend setup
HOST = "https://wdev.trackit-system.de/sonari"
BASE_URL = f"{HOST}/api/v1"

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

def test_get_annotation_tasks(session: requests.Session, annotation_project_uuid: str, limit: int) -> Dict[str, Any]:
    
    try:
        log_info('Sending GET request to /api/v1/annotation_tasks/')
        log_info('Parameters: limit=-1, offset=0')
        
        response = session.get(
            f'{BASE_URL}/annotation_tasks/',
            params={
                'limit': limit,
                'offset': 0,
                'annotation_project__eq': annotation_project_uuid,
            },
            headers={'Content-Type': 'application/json'},
        )
        
        response.raise_for_status()
        data = response.json()
        
        log_success('Successfully fetched annotation tasks')
        
        # Validate response structure
        if 'items' not in data or not isinstance(data['items'], list):
            raise ValueError('Response missing items array')
        
        if 'total' not in data or not isinstance(data['total'], int):
            raise ValueError('Response missing total count')
        
        log_info(f"Total annotation tasks: {data['total']}")
        log_info(f"Returned items: {len(data['items'])}")
        log_info(f"Limit: {data['limit']}, Offset: {data['offset']}")
        
        # Display first project if available
        if data['items']:
            print(f"Project UUID: {annotation_project_uuid} has {len(data['items'])} tasks")
        
        return data
        
    except requests.exceptions.RequestException as error:
        log_error(f"Failed to fetch annotation tasks: {error}")
        if hasattr(error, 'response') and error.response is not None:
            log_error(f"Status: {error.response.status_code}")
            log_error(f"Response: {error.response.text}")
        raise
    
def test_get_clip_annotations(session: requests.Session, annotation_project_uuid: str, limit: int) -> Dict[str, Any]:
    
    try:
        log_info('Sending GET request to /api/v1/annotation_tasks/')
        log_info('Parameters: limit=-1, offset=0')
        
        response = session.get(
            f'{BASE_URL}/clip_annotations/',
            params={
                'limit': limit,
                'offset': 0,
                'annotation_project__eq': annotation_project_uuid,
            },
            headers={'Content-Type': 'application/json'},
        )
        
        response.raise_for_status()
        data = response.json()
        return data
        
    except requests.exceptions.RequestException as error:
        log_error(f"Failed to fetch annotation tasks: {error}")
        if hasattr(error, 'response') and error.response is not None:
            log_error(f"Status: {error.response.status_code}")
            log_error(f"Response: {error.response.text}")
        raise
    
def test_get_annotation_task_detail(session: requests.Session, annotation_task_uuid: str) -> Dict[str, Any]:
    
    try:
        log_info('Sending GET request to /api/v1/annotation_tasks/')
        log_info('Parameters: limit=-1, offset=0')
        
        response = session.get(
            f'{BASE_URL}/annotation_tasks/detail/clip_annotation/',
            params={
                'annotation_task_uuid': annotation_task_uuid,
            },
            headers={'Content-Type': 'application/json'},
        )
        
        response.raise_for_status()
        data = response.json()
        
        log_success('Successfully fetched annotation task')
        
        return data
        
    except requests.exceptions.RequestException as error:
        log_error(f"Failed to fetch annotation tasks: {error}")
        if hasattr(error, 'response') and error.response is not None:
            log_error(f"Status: {error.response.status_code}")
            log_error(f"Response: {error.response.text}")
        raise


def run_tests_annotate_view(run_number: int = 1, csv_filename: str = 'annotate_view_time_logs.csv'):
    """
    Main test runner.
    
    Args:
        run_number: The current run number (for tracking multiple runs)
        csv_filename: The CSV file to write/append logs to
    """
    # Create session for authenticated requests
    session = requests.Session()
    
    # List to store time logs
    time_logs = []
    
    # Get current timestamp
    timestamp = datetime.now().isoformat()
    
    try:
        # Authenticate first
        authenticate(session)
        t0 = time.time()
        # Test 1: Get many projects
        annotation_tasks = test_get_annotation_tasks(session, "f96e155a-151b-4240-96a0-5585847271d6", -1)
        get_many_time = time.time() - t0
        print(f"Time taken to get annotation tasks: {get_many_time}")
        
        # Log the get many projects time
        time_logs.append({
            'run_number': run_number,
            'timestamp': timestamp,
            'operation': 'get_all_annotation_tasks',
            'time_seconds': get_many_time,
        })
        
        #t1 = time.time()
        # Test 1: Get many projects
        #clip_annotations = test_get_clip_annotations(session, "f96e155a-151b-4240-96a0-5585847271d6", -1)
        #get_many_time = time.time() - t1
        #print(f"Time taken to get clip annotations: {get_many_time}")
        
        # Log the get many projects time
        #time_logs.append({
        #    'run_number': run_number,
        #    'timestamp': timestamp,
        #    'operation': 'get_all_clip_annotations',
        #    'time_seconds': get_many_time,
        #})
        
        annotation_task_uuid = annotation_tasks['items'][0]['uuid'] 
        
        t2 = time.time()
        annotation_task_detail = test_get_annotation_task_detail(session, annotation_task_uuid)
        get_many_time = time.time() - t2
        print(f"Time taken to get annotation task detail: {get_many_time}")
        
        # Log the get many projects time
        time_logs.append({
            'run_number': run_number,
            'timestamp': timestamp,
            'operation': 'get_annotation_task_detail',
            'time_seconds': get_many_time,
        })
        
        total_time = time.time() - t0
        print(f"Total time taken: {total_time}")
        
        # Log the total time
        time_logs.append({
            'run_number': run_number,
            'timestamp': timestamp,
            'operation': 'total_time',
            'time_seconds': total_time,
        })
        
        # Check if file exists to determine if we need to write header
        file_exists = os.path.isfile(csv_filename)
        
        # Write time logs to CSV file (append mode)
        with open(csv_filename, 'a', newline='') as csvfile:
            fieldnames = ['run_number', 'timestamp', 'operation', 'time_seconds']
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
            
            # Write header only if file is new
            if not file_exists:
                writer.writeheader()
            
            for log_entry in time_logs:
                writer.writerow(log_entry)
        
        log_success(f"\nTime logs appended to {csv_filename} (Run #{run_number})")
        
    except Exception as error:
        log_error(f"\nTest suite failed: {error}")
        raise

        

def main():
    """
    Main entry point with CLI argument parsing.
    """
    parser = argparse.ArgumentParser(
        description='Test Frontend → Backend Annotation Projects API',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
Examples:
  # Run tests once (default)
  python test_annotation_projects_api.py
  
  # Run tests 5 times and append all logs to CSV
  python test_annotation_projects_api.py --runs 5
  
  # Run tests 10 times with custom CSV filename
  python test_annotation_projects_api.py --runs 10 --output my_logs.csv
        '''
    )
    
    parser.add_argument(
        '--runs',
        type=int,
        default=1,
        help='Number of times to run the tests (default: 1)'
    )
    
    parser.add_argument(
        '--output',
        type=str,
        default='annotation_projects_time_logs.csv',
        help='CSV filename to write logs to (default: annotation_projects_time_logs.csv)'
    )
    
    parser.add_argument(
        '--test',
        type=int,
        help='Select which test to run: 1 for project list, 2 for project detail'
    )
    
    args = parser.parse_args()
    
    # Validate runs parameter
    if args.runs < 1:
        log_error("Error: --runs must be at least 1")
        return 1
    
    log_section(f'RUNNING {args.runs} TEST{"S" if args.runs > 1 else ""}')
    log_info(f"Output file: {args.output}")
    
    # Run tests multiple times
    failed_runs = 0
    for run_num in range(1, args.runs + 1):
        if args.runs > 1:
            log_section(f'RUN {run_num}/{args.runs}')
        
        try:
            match args.test:
                case 1:
                    run_tests_annotate_view(run_number=run_num, csv_filename=args.output)
                case _:
                    log_error("Error: --test must be 1 or 2")
                    return 1
            
            # Add a small delay between runs to avoid rate limiting
            if run_num < args.runs:
                time.sleep(1)
                
        except Exception as e:
            log_error(f"Run {run_num} failed: {e}")
            failed_runs += 1
            
            # Ask if we should continue on failure
            if run_num < args.runs:
                log_info(f"Continuing with remaining runs...")
                time.sleep(1)
    
    # Summary
    if args.runs > 1:
        log_section('SUMMARY')
        successful_runs = args.runs - failed_runs
        log_info(f"Successful runs: {successful_runs}/{args.runs}")
        if failed_runs > 0:
            log_error(f"Failed runs: {failed_runs}/{args.runs}")
        log_success(f"\nAll logs saved to: {args.output}")
    
    return 0 if failed_runs == 0 else 1


if __name__ == '__main__':
    sys.exit(main())

