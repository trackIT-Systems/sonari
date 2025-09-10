"""Unified time series chart generation for exports."""

import base64
import datetime
from collections import defaultdict
from io import BytesIO
from typing import Any, Dict, List

import matplotlib

matplotlib.use("Agg")  # Use non-interactive backend
import matplotlib.pyplot as plt
from matplotlib.ticker import MaxNLocator


def generate_time_series_chart(
    datetime_data: List[Dict[str, Any]],
    no_datetime_data: List[Dict[str, Any]],
    chart_type: str = "events",
    event_threshold: int | None = None,
    project_name: str | None = None,
) -> str:
    """Generate a unified time series bar chart for different export types.

    Args:
        datetime_data: Data with datetime information
        no_datetime_data: Data without datetime information
        chart_type: Type of chart - "events" for event counts, "passes" for pass counts
        event_threshold: Event threshold for passes charts (required for passes)
        project_name: Name of the project to include in chart title

    Returns
    -------
        Base64 encoded PNG chart
    """
    # Combine all data for processing
    all_data = datetime_data + no_datetime_data

    if not all_data:
        return ""

    # Group data by species, status, and time periods
    species_status_data = defaultdict(lambda: defaultdict(lambda: {"periods": [], "counts": []}))

    for data_entry in all_data:
        species = data_entry["species_tag"]
        status = data_entry.get("status", "no_status")
        time_period = data_entry["time_period_start"]

        if chart_type == "passes":
            count = data_entry["pass_count"]
        else:  # events
            count = data_entry["event_count"]

        species_status_data[species][status]["periods"].append(time_period)
        species_status_data[species][status]["counts"].append(count)

    # Create the chart
    plt.style.use("default")
    fig, ax = plt.subplots(figsize=(14, 6))

    # Get unique time periods and species-status combinations
    # Separate datetime periods from "No Date" periods
    datetime_periods = []
    no_date_periods = []

    for species_data in species_status_data.values():
        for status_data in species_data.values():
            for period in status_data["periods"]:
                if period == "No Date":
                    if period not in no_date_periods:
                        no_date_periods.append(period)
                else:
                    if period not in datetime_periods:
                        datetime_periods.append(period)

    # Sort datetime periods, keep "No Date" periods at the end
    datetime_periods.sort()
    all_periods = datetime_periods + no_date_periods

    # Create list of all species-status combinations
    species_status_combinations = []
    for species in sorted(species_status_data.keys()):
        for status in sorted(species_status_data[species].keys()):
            species_status_combinations.append((species, status))

    # Define hatch patterns for different statuses
    status_hatches = {
        "no_status": None,
        "completed": "///",
        "assigned": "---",
        "rejected": "...",
        "verified": "xxx",
    }

    # Set up colors for species using tab10 with rotation for more than 10 species
    unique_species = list(set(species for species, _ in species_status_combinations))
    tab10_colors = plt.cm.tab10.colors
    species_colors = {species: tab10_colors[i % len(tab10_colors)] for i, species in enumerate(unique_species)}

    # Bar width and positions
    bar_width = 0.8 / len(species_status_combinations) if species_status_combinations else 0.8
    x_positions = range(len(all_periods))

    # Plot bars for each species-status combination
    for i, (species, status) in enumerate(species_status_combinations):
        data = species_status_data[species][status]
        color = species_colors[species]
        print(f"########### {status}")
        hatch = status_hatches[status]  # Default to dots if status not recognized

        # Create counts array for all time periods (0 for missing periods)
        counts_for_periods = []
        for period in all_periods:
            if period in data["periods"]:
                idx = data["periods"].index(period)
                counts_for_periods.append(data["counts"][idx])
            else:
                counts_for_periods.append(0)

        # Calculate x positions for this species-status combination
        combo_x_positions = [x + i * bar_width for x in x_positions]

        # Create bars with hatching for status
        label = (
            f"{species} ({status.replace('assigned', 'unsure').replace('completed', 'accepted')})"
            if status != "no_status"
            else species
        )
        ax.bar(combo_x_positions, counts_for_periods, bar_width, label=label, color=color, alpha=0.8, hatch=hatch)

    # Customize the chart
    ax.set_xlabel("Time Period", fontsize=12)

    if chart_type == "passes":
        ax.set_ylabel("Number of Passes", fontsize=12)
        title = project_name if project_name else ""
        ax.set_title(title, fontsize=14)
    else:
        ax.set_ylabel("Number of Events", fontsize=12)
        title = project_name if project_name else ""
        ax.set_title(title, fontsize=14)

    # Set x-axis labels
    ax.set_xticks([x + bar_width * (len(species_status_combinations) - 1) / 2 for x in x_positions])

    # Format time period labels
    period_labels = []
    for period in all_periods:
        if period == "No Date":
            period_labels.append("No Date/Time")
        else:
            try:
                # Try to parse and format the datetime
                dt = datetime.datetime.strptime(period, "%Y-%m-%d %H:%M:%S")
                period_labels.append(dt.strftime("%m/%d %H:%M"))
            except (ValueError, TypeError):
                # Fallback to original string
                period_labels.append(period[:10] if len(period) > 10 else period)

    ax.set_xticklabels(period_labels, rotation=45, ha="right")

    # Add visual separator between datetime and no-datetime data
    if datetime_periods and no_date_periods:
        separator_x = len(datetime_periods) - 0.5
        ax.axvline(x=separator_x, color="gray", linestyle=":", alpha=0.5, linewidth=2)

    # Set y-axis - let matplotlib handle ticks automatically
    # but ensure we start from 0 and use integer ticks
    ax.set_ylim(bottom=0)

    # Use integer ticks (no fractional events/passes)
    ax.yaxis.set_major_locator(MaxNLocator(integer=True))

    # Add legend
    ax.legend(bbox_to_anchor=(1.05, 1), loc="upper left")

    # Add grid for better readability
    ax.grid(True, alpha=0.3)

    # Tight layout to prevent label cutoff
    plt.tight_layout()

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
