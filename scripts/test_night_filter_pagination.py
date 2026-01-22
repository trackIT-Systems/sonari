#!/usr/bin/env python3
"""
Test Script: Night Filter Pagination Issue

This script tests the night filter API to verify if pagination is causing
the issue where 0 results are returned for large datasets.

It tests:
1. First page with night filter (limit=100, offset=0)
2. Multiple pages to see if results differ
3. Comparison with expected behavior

Prerequisites:
- Backend server running
- Python 3.10+ with requests library (pip install requests)
- Valid user credentials

Usage:
  python scripts/test_night_filter_pagination.py --host http://localhost:5000 --username username --password password --project-id x
"""

import argparse
import json
import sys
from typing import Any, Dict, List, Optional

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
            # Session automatically stores cookies
            return True
        else:
            response.raise_for_status()
        
    except requests.exceptions.RequestException as error:
        log_error(f"Authentication failed: {error}")
        if hasattr(error, 'response') and error.response is not None:
            log_error(f"Status: {error.response.status_code}")
            log_error(f"Response: {error.response.text if error.response.text else 'No response body'}")
        raise


def test_night_filter_page(
    session: requests.Session,
    base_url: str,
    project_id: int,
    timezone: str,
    limit: int = 100,
    offset: int = 0
) -> Dict[str, Any]:
    """
    Test night filter with specific pagination.
    
    Args:
        session: Authenticated requests session
        base_url: Base URL of the API
        project_id: Annotation project ID
        timezone: Timezone for night filter (e.g., 'Europe/Berlin')
        limit: Number of tasks to fetch
        offset: Offset for pagination
        
    Returns:
        Dictionary with results and metadata
    """
    params = {
        'limit': limit,
        'offset': offset,
        'annotation_project__eq': project_id,
        'night__eq': 'true',
        'night__tz': timezone,
        'include_recording': 'true',
        'include_sound_event_annotations': 'true',
        'include_sound_event_tags': 'true',
        'include_tags': 'true',
        'include_notes': 'true',
        'include_status_badges': 'true',
        'include_status_badge_users': 'true',
    }
    
    try:
        response = session.get(
            f'{base_url}/annotation_tasks/',
            params=params
        )
        response.raise_for_status()
        
        data = response.json()
        return {
            'success': True,
            'limit': limit,
            'offset': offset,
            'items_count': len(data.get('items', [])),
            'total': data.get('total', 0),
            'data': data
        }
    except requests.exceptions.RequestException as error:
        log_error(f"Request failed: {error}")
        if hasattr(error, 'response') and error.response is not None:
            log_error(f"Status: {error.response.status_code}")
            log_error(f"Response: {error.response.text if error.response.text else 'No response body'}")
        return {
            'success': False,
            'limit': limit,
            'offset': offset,
            'error': str(error)
        }


def test_day_filter_page(
    session: requests.Session,
    base_url: str,
    project_id: int,
    timezone: str,
    limit: int = 100,
    offset: int = 0
) -> Dict[str, Any]:
    """
    Test day filter with specific pagination.
    
    Args:
        session: Authenticated requests session
        base_url: Base URL of the API
        project_id: Annotation project ID
        timezone: Timezone for day filter (e.g., 'Europe/Berlin')
        limit: Number of tasks to fetch
        offset: Offset for pagination
        
    Returns:
        Dictionary with results and metadata
    """
    params = {
        'limit': limit,
        'offset': offset,
        'annotation_project__eq': project_id,
        'day__eq': 'true',
        'day__tz': timezone,
        'include_recording': 'true',
        'include_sound_event_annotations': 'true',
        'include_sound_event_tags': 'true',
        'include_tags': 'true',
        'include_notes': 'true',
        'include_status_badges': 'true',
        'include_status_badge_users': 'true',
    }
    
    try:
        response = session.get(
            f'{base_url}/annotation_tasks/',
            params=params
        )
        response.raise_for_status()
        
        data = response.json()
        return {
            'success': True,
            'limit': limit,
            'offset': offset,
            'items_count': len(data.get('items', [])),
            'total': data.get('total', 0),
            'data': data
        }
    except requests.exceptions.RequestException as error:
        log_error(f"Request failed: {error}")
        if hasattr(error, 'response') and error.response is not None:
            log_error(f"Status: {error.response.status_code}")
            log_error(f"Response: {error.response.text if error.response.text else 'No response body'}")
        return {
            'success': False,
            'limit': limit,
            'offset': offset,
            'error': str(error)
        }


def test_without_filter(
    session: requests.Session,
    base_url: str,
    project_id: int,
    limit: int = 100,
    offset: int = 0
) -> Dict[str, Any]:
    """
    Test without night/day filter to get baseline.
    
    Args:
        session: Authenticated requests session
        base_url: Base URL of the API
        project_id: Annotation project ID
        limit: Number of tasks to fetch
        offset: Offset for pagination
        
    Returns:
        Dictionary with results and metadata
    """
    params = {
        'limit': limit,
        'offset': offset,
        'annotation_project__eq': project_id,
        'include_recording': 'true',
    }
    
    try:
        response = session.get(
            f'{base_url}/annotation_tasks/',
            params=params
        )
        response.raise_for_status()
        
        data = response.json()
        return {
            'success': True,
            'limit': limit,
            'offset': offset,
            'items_count': len(data.get('items', [])),
            'total': data.get('total', 0),
            'data': data
        }
    except requests.exceptions.RequestException as error:
        log_error(f"Request failed: {error}")
        return {
            'success': False,
            'limit': limit,
            'offset': offset,
            'error': str(error)
        }


def main():
    parser = argparse.ArgumentParser(
        description='Test night filter pagination issue',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Test on localhost
  python scripts/test_night_filter_pagination.py --host http://localhost:5000 --username admin --password admin --project-id 24

  # Test on production
  python scripts/test_night_filter_pagination.py --host https://your-server.com/sonari --username youruser --password yourpass --project-id 24 --timezone Europe/Berlin
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
        '--project-id',
        type=int,
        required=True,
        help='Annotation project ID to test'
    )
    parser.add_argument(
        '--timezone',
        type=str,
        default='Europe/Berlin',
        help='Timezone for night/day filter (default: Europe/Berlin)'
    )
    parser.add_argument(
        '--pages',
        type=int,
        default=5,
        help='Number of pages to test (default: 5)'
    )
    parser.add_argument(
        '--page-size',
        type=int,
        default=100,
        help='Page size for testing (default: 100)'
    )
    
    args = parser.parse_args()
    
    base_url = f"{args.host}/api/v1"
    
    # Create session
    session = requests.Session()
    
    try:
        # Authenticate
        authenticate(session, base_url, args.username, args.password)
        
        log_section('BASELINE TEST (No Filter)')
        baseline = test_without_filter(session, base_url, args.project_id, limit=args.page_size, offset=0)
        if baseline['success']:
            log_success(f"Total tasks in project: {baseline['total']}")
            log_info(f"First page items: {baseline['items_count']}")
        else:
            log_error(f"Baseline test failed: {baseline.get('error')}")
            return 1
        
        log_section('NIGHT FILTER TEST - Multiple Pages')
        night_results = []
        for page in range(args.pages):
            offset = page * args.page_size
            log_info(f"Testing page {page + 1} (offset={offset}, limit={args.page_size})")
            result = test_night_filter_page(
                session, base_url, args.project_id, args.timezone,
                limit=args.page_size, offset=offset
            )
            night_results.append(result)
            
            if result['success']:
                log_success(f"  Page {page + 1}: {result['items_count']} items, total={result['total']}")
                if result['items_count'] == 0 and page == 0:
                    log_warning("  ⚠ First page returned 0 results - this is the pagination issue!")
            else:
                log_error(f"  Page {page + 1} failed: {result.get('error')}")
        
        log_section('DAY FILTER TEST - Multiple Pages')
        day_results = []
        for page in range(args.pages):
            offset = page * args.page_size
            log_info(f"Testing page {page + 1} (offset={offset}, limit={args.page_size})")
            result = test_day_filter_page(
                session, base_url, args.project_id, args.timezone,
                limit=args.page_size, offset=offset
            )
            day_results.append(result)
            
            if result['success']:
                log_success(f"  Page {page + 1}: {result['items_count']} items, total={result['total']}")
            else:
                log_error(f"  Page {page + 1} failed: {result.get('error')}")
        
        log_section('ANALYSIS')
        
        # Analyze night filter results
        night_total_first_page = night_results[0]['total'] if night_results[0]['success'] else 0
        night_items_first_page = night_results[0]['items_count'] if night_results[0]['success'] else 0
        night_items_all_pages = sum(r['items_count'] for r in night_results if r['success'])
        
        log_info("Night Filter Results:")
        log(f"  First page items: {night_items_first_page}", Colors.CYAN)
        log(f"  First page total: {night_total_first_page}", Colors.CYAN)
        log(f"  Items across all {args.pages} pages: {night_items_all_pages}", Colors.CYAN)
        
        if night_items_first_page == 0 and night_total_first_page > 0:
            log_error("  ⚠ PAGINATION ISSUE CONFIRMED: First page has 0 items but total > 0")
            log_error("     This means night recordings exist but are not in the first page")
        elif night_items_first_page == 0 and night_total_first_page == 0:
            log_warning("  ⚠ No night recordings found in first page, and total is 0")
            log_warning("     This could mean:")
            log_warning("     1. No night recordings exist in the project")
            log_warning("     2. Recordings don't have date/time fields")
            log_warning("     3. All recordings are filtered out")
        elif night_items_first_page > 0:
            log_success(f"  ✓ Night filter working correctly on first page")
        
        # Analyze day filter results
        day_total_first_page = day_results[0]['total'] if day_results[0]['success'] else 0
        day_items_first_page = day_results[0]['items_count'] if day_results[0]['success'] else 0
        day_items_all_pages = sum(r['items_count'] for r in day_results if r['success'])
        
        log_info("Day Filter Results:")
        log(f"  First page items: {day_items_first_page}", Colors.CYAN)
        log(f"  First page total: {day_total_first_page}", Colors.CYAN)
        log(f"  Items across all {args.pages} pages: {day_items_all_pages}", Colors.CYAN)
        
        # Summary
        log_section('SUMMARY')
        log_info(f"Project ID: {args.project_id}")
        log_info(f"Total tasks (no filter): {baseline['total']}")
        log_info(f"Night filter - First page: {night_items_first_page}/{night_total_first_page}")
        log_info(f"Day filter - First page: {day_items_first_page}/{day_total_first_page}")
        
        if night_items_first_page == 0 and night_total_first_page > 0:
            log_error("\n⚠ PAGINATION ISSUE DETECTED!")
            log_error("The night filter is applied AFTER pagination, so if the first page")
            log_error("doesn't contain night recordings, you get 0 results even though")
            log_error("night recordings exist in later pages.")
            return 1
        else:
            log_success("\n✓ No pagination issue detected (or issue not present in tested pages)")
            return 0
            
    except KeyboardInterrupt:
        log_warning("\nTest interrupted by user")
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
