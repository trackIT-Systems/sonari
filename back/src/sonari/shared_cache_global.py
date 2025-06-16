"""Global shared cache registry - dependency-free module."""

# Global shared cache - will be set by app initialization
_shared_cache = None


def set_shared_cache(cache):
    """Set the global shared cache."""
    global _shared_cache
    _shared_cache = cache


def get_shared_cache():
    """Get the global shared cache."""
    return _shared_cache
