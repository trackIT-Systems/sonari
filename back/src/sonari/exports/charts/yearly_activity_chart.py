"""Yearly activity heatmap chart generation for exports."""

import base64
import calendar
from collections import defaultdict
from io import BytesIO
from typing import Any, Dict, List

import matplotlib
import numpy as np
from astral import LocationInfo
from astral.sun import sun

matplotlib.use("Agg")  # Use non-interactive backend
import matplotlib.pyplot as plt


def generate_yearly_activity_heatmap(
    yearly_activity_data: List[Dict[str, Any]],
    project_name: str,
    species_tags: List[str],
    location_data: Dict[str, Any] | None = None,
) -> str:
    """Generate a yearly activity heatmap with subplots for each species tag.

    Args:
        yearly_activity_data: Data with hour_of_day, day_of_year, and event_count
        project_name: Name of the project to include in chart title
        species_tags: List of species tags to create subplots for

    Returns
    -------
        Base64 encoded PNG chart
    """
    if not yearly_activity_data or not species_tags:
        return ""

    # Group data by species tag
    data_by_species = defaultdict(list)
    for data_entry in yearly_activity_data:
        species = data_entry["species_tag"]
        data_by_species[species].append(data_entry)

    # Determine subplot layout (try to make it roughly square)
    num_species = len(species_tags)
    if num_species == 1:
        rows, cols = 1, 1
    elif num_species <= 4:
        rows, cols = 2, 2
    elif num_species <= 6:
        rows, cols = 2, 3
    elif num_species <= 9:
        rows, cols = 3, 3
    else:
        rows = int(np.ceil(np.sqrt(num_species)))
        cols = int(np.ceil(num_species / rows))

    # Create figure with subplots
    fig, axes = plt.subplots(rows, cols, figsize=(4 * cols, 3 * rows))
    fig.suptitle(f"{project_name}", va="top", fontsize=14)

    # Handle single subplot case
    if num_species == 1:
        axes = [axes]
    elif rows == 1 or cols == 1:
        axes = axes.flatten() if hasattr(axes, "flatten") else [axes]
    else:
        axes = axes.flatten()

    # Find global min/max for consistent color scale across subplots
    all_counts = [entry["event_count"] for entry in yearly_activity_data]
    if all_counts:
        global_min, global_max = min(all_counts), max(all_counts)
        # Ensure we have a range for the colorbar
        if global_min == global_max:
            global_max = global_min + 1
    else:
        global_min, global_max = 0, 1

    # Determine the month range for this project (across all species)
    project_min_day = float("inf")
    project_max_day = 0

    # Look at all species data for this project to find the full day range
    for species_data_all in data_by_species.values():
        for data_entry in species_data_all:
            day = data_entry["day_of_year"]
            project_min_day = min(project_min_day, day)
            project_max_day = max(project_max_day, day)

    # If no data at all, default to showing January (day 1-31)
    if project_min_day == float("inf"):
        project_min_day = 1
        project_max_day = 31

    # Convert days to months and find month boundaries
    def day_to_month(day_of_year):
        """Convert day of year to month number (1-12)."""
        cumulative = 0
        for month in range(1, 13):
            month_days = calendar.monthrange(2023, month)[1]
            if day_of_year <= cumulative + month_days:
                return month
            cumulative += month_days
        return 12  # Fallback to December

    project_min_month = day_to_month(project_min_day)
    project_max_month = day_to_month(project_max_day)

    # Calculate the first and last day of the month range
    def month_to_first_day(month):
        """Get first day of year for given month."""
        cumulative = 1
        for m in range(1, month):
            cumulative += calendar.monthrange(2023, m)[1]
        return cumulative

    def month_to_last_day(month):
        """Get last day of year for given month."""
        return month_to_first_day(month) + calendar.monthrange(2023, month)[1] - 1

    start_day_idx = month_to_first_day(project_min_month) - 1  # Convert to 0-based indexing
    end_day_idx = month_to_last_day(project_max_month)

    # Create heatmap for each species
    for i, species_tag in enumerate(species_tags):
        ax = axes[i]
        species_data = data_by_species[species_tag]

        # Create 24x366 matrix (handle leap years, max days)
        heatmap_matrix = np.zeros((24, 366))

        # Fill matrix with event counts
        for data_entry in species_data:
            hour = data_entry["hour_of_day"]
            day = data_entry["day_of_year"] - 1  # Convert to 0-based indexing
            count = data_entry["event_count"]

            if 0 <= hour < 24 and 0 <= day < 366:
                heatmap_matrix[hour, day] = count

        # Extract the relevant slice of the heatmap for this project's day range
        heatmap_display = heatmap_matrix[:, start_day_idx:end_day_idx]

        # Create heatmap
        im = ax.imshow(
            heatmap_display,
            # cmap="coolwarm",
            aspect="auto",
            vmin=global_min,
            vmax=global_max,
            origin="lower",
        )

        # Set title
        ax.set_title(f"{species_tag}", fontsize=12)

        # Set y-axis label only for leftmost subplots
        if i % cols == 0:  # First column
            ax.set_ylabel("Hour of Day")

        # Set x-axis ticks based on month boundaries
        # Determine if this is a bottom row subplot
        is_bottom_row = i >= num_species - (num_species % cols if num_species % cols != 0 else cols)

        # Generate month ticks for the month range
        month_starts = []
        month_labels = []

        for month in range(project_min_month, project_max_month + 1):
            # Calculate the start day of this month relative to our display range
            month_first_day = month_to_first_day(month)
            relative_start = month_first_day - (start_day_idx + 1)  # +1 to convert back from 0-based

            month_starts.append(relative_start)
            month_labels.append(calendar.month_abbr[month])

        ax.set_xticks(month_starts)
        ax.set_xticklabels(month_labels)

        # Set x-axis label only for bottom row subplots
        if is_bottom_row:
            ax.set_xlabel("Month")

        # Set y-axis ticks (hours)
        hour_ticks = [0, 6, 12, 18, 23]
        ax.set_yticks(hour_ticks)
        ax.set_yticklabels([f"{h:02d}:00" for h in hour_ticks])

        # Add sunrise/sunset lines if location data is available
        if location_data:
            sunrise_sunset_times = _calculate_sunrise_sunset(location_data, start_day_idx, end_day_idx)
            _draw_sunrise_sunset_lines(ax, sunrise_sunset_times, start_day_idx)

        # Add grid for better readability
        ax.grid(True, alpha=0.3, linewidth=0.5)

    # Hide empty subplots
    for i in range(num_species, len(axes)):
        axes[i].set_visible(False)

    # Adjust layout first to make room for colorbar
    plt.tight_layout(pad=1, h_pad=2, w_pad=2)  # Increase padding between subplots
    plt.subplots_adjust(top=1.5, bottom=0.25)  # Make more room for suptitle and horizontal colorbar

    # Add horizontal colorbar at the bottom, centered
    cbar = fig.colorbar(im, ax=axes[:num_species], orientation="horizontal", shrink=0.6, aspect=30, pad=0.1)
    cbar.set_label("Event Count", labelpad=10)

    # Save to buffer
    buffer = BytesIO()
    plt.savefig(buffer, format="png", dpi=150, bbox_inches="tight")
    buffer.seek(0)

    # Convert to base64
    chart_base64 = base64.b64encode(buffer.getvalue()).decode("utf-8")

    # Clean up
    plt.close(fig)
    buffer.close()

    return chart_base64


def _calculate_sunrise_sunset(
    location_data: Dict[str, Any], start_day_idx: int, end_day_idx: int
) -> Dict[int, Dict[str, float]]:
    """Calculate sunrise and sunset times for each day in the range."""
    import datetime

    sunrise_sunset_times = {}

    # Create observer based on location data
    if "latitude" in location_data and "longitude" in location_data:
        observer = LocationInfo(latitude=location_data["latitude"], longitude=location_data["longitude"]).observer
    elif "timezone" in location_data:
        observer = LocationInfo(timezone=location_data["timezone"]).observer
    else:
        return {}

    # Calculate for each day in the range
    days_calculated = 0
    for day_of_year in range(start_day_idx + 1, end_day_idx + 1):  # Convert back to 1-based
        try:
            # Convert day of year to date (using 2023 as reference year)
            date = datetime.datetime(2023, 1, 1) + datetime.timedelta(days=day_of_year - 1)

            # Calculate sun times
            s = sun(observer, date=date.date())

            # Convert to hours (0-24)
            sunrise_hour = s["sunrise"].hour + s["sunrise"].minute / 60.0
            sunset_hour = s["sunset"].hour + s["sunset"].minute / 60.0

            sunrise_sunset_times[day_of_year] = {"sunrise": sunrise_hour, "sunset": sunset_hour}
            days_calculated += 1
        except Exception:
            continue

    return sunrise_sunset_times


def _draw_sunrise_sunset_lines(ax, sunrise_sunset_times: Dict[int, Dict[str, float]], start_day_idx: int):
    """Draw sunrise and sunset lines on the heatmap."""
    if not sunrise_sunset_times:
        return

    days = []
    sunrise_hours = []
    sunset_hours = []

    for day_of_year, times in sunrise_sunset_times.items():
        # Convert day to relative position in the display range
        relative_day = day_of_year - start_day_idx - 1  # Convert to 0-based relative position
        days.append(relative_day)
        sunrise_hours.append(times["sunrise"])
        sunset_hours.append(times["sunset"])

    # Draw lines
    if days and sunrise_hours:
        ax.plot(days, sunrise_hours, color="black")

    if days and sunset_hours:
        ax.plot(days, sunset_hours, color="black")
