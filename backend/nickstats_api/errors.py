class ApiError(Exception):
    def __init__(self, status, code, message, details=None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = details


class ValidationError(ApiError):
    def __init__(self, message, path=None):
        details = {"path": path} if path else None
        super().__init__(400, "invalid_match", message, details)

