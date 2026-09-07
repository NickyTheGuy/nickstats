import hmac
import os

from flask import request

from .errors import ApiError


def require_upload_token():
    expected = os.getenv("NICKSTATS_UPLOAD_TOKEN")
    if not expected:
        raise ApiError(503, "upload_disabled", "Match uploads are not configured.")

    header = request.headers.get("Authorization", "")
    scheme, separator, supplied = header.partition(" ")
    if separator != " " or scheme.lower() != "bearer" or not hmac.compare_digest(supplied, expected):
        raise ApiError(401, "unauthorized", "A valid upload token is required.")

