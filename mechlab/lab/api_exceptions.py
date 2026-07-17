from rest_framework.exceptions import APIException, ErrorDetail, ValidationError
from rest_framework.views import exception_handler


def _plain(value):
    if isinstance(value, ErrorDetail):
        return str(value)
    if isinstance(value, dict):
        return {key: _plain(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_plain(item) for item in value]
    return value


def opedu_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is None:
        return None

    original = _plain(response.data)
    if isinstance(exc, ValidationError):
        message = "The request contains invalid data."
        code = "validation_error"
        fields = original
    else:
        detail = original.get("detail") if isinstance(original, dict) else original
        message = str(detail or "The request could not be completed.")
        code = getattr(exc, "default_code", "api_error")
        fields = None

    response.data = {
        "detail": message,
        "code": str(code),
        "errors": fields,
    }
    if isinstance(exc, APIException):
        response.data["status"] = response.status_code
    return response
