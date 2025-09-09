"""Response building utilities for exports."""

import datetime

from fastapi.responses import StreamingResponse


def create_csv_streaming_response(generator_func, export_type: str) -> StreamingResponse:
    """Create a streaming CSV response with standardized filename."""
    filename = f"{datetime.datetime.now().strftime('%d.%m.%Y_%H_%M')}_{export_type}.csv"
    return StreamingResponse(
        generator_func(),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
        },
    )
