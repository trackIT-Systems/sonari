"""API utility functions for working with features.

Since features are now denormalized (feature names are stored as strings directly
in feature tables), this module only provides helper utility functions.
"""

from typing import Any, Sequence

from sonari import schemas

__all__ = [
    "find_feature",
    "find_feature_value",
]


def find_feature(
    features: Sequence[schemas.Feature],
    feature_name: str,
    default: Any = None,
) -> schemas.Feature | None:
    """Find a feature from a list of features by its name.

    Helper function for finding a feature by name. Returns the first feature
    with the given name, or a default value if no feature is found.

    Parameters
    ----------
    features
        The features to search.
    feature_name
        The name of the feature to find.
    default
        The default value to return if the feature is not found.

    Returns
    -------
    feature : schemas.Feature | None
        The feature, or the default value if the feature was not found.
    """
    return next((f for f in features if f.name == feature_name), default)


def find_feature_value(
    features: Sequence[schemas.Feature],
    feature_name: str,
    default: Any = None,
) -> float | None:
    """Find the value of a feature from a list of features by its name.

    Parameters
    ----------
    features
        The features to search.
    feature_name
        The name of the feature to find.
    default
        The default value to return if the feature is not found.

    Returns
    -------
    value : float | None
        The feature value, or the default value if the feature was not found.
    """
    feature = find_feature(features, feature_name)
    if feature is None:
        return default
    return feature.value
