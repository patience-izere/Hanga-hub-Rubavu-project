"""CSV downloads that spreadsheet software opens safely."""

import csv
import io

from django.http import HttpResponse


def _safe(value):
    # Names and titles come from users; a cell starting with =, +, - or @ would run as a formula
    # when the file is opened in Excel or LibreOffice.
    if isinstance(value, str) and value[:1] in ("=", "+", "-", "@"):
        return f"'{value}"
    return value


def csv_response(filename: str, header: list[str], rows) -> HttpResponse:
    stream = io.StringIO()
    # A byte-order mark makes Excel read the file as UTF-8, so names with accents survive.
    stream.write("﻿")
    writer = csv.writer(stream)
    writer.writerow(header)
    for row in rows:
        writer.writerow([_safe(value) for value in row])
    response = HttpResponse(stream.getvalue(), content_type="text/csv; charset=utf-8")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response
