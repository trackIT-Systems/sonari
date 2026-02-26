"""Exports test fixtures.

Load app before export tests to resolve circular import (sonari.exports <-> sonari.routes).
"""

from sonari.system import create_app, get_settings

# Force full app load so sonari.exports and sonari.routes are initialized
# before export test modules import from sonari.exports.data
_ = create_app(get_settings())
