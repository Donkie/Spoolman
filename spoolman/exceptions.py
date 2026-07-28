"""Various exceptions used."""


class ItemNotFoundError(Exception):
    pass


class ItemDeleteError(Exception):
    pass


class ItemCreateError(Exception):
    pass


class SpoolMeasureError(Exception):
    pass


class AuthenticationRequiredError(Exception):
    """No usable credential was presented. Mapped to HTTP 401."""


class PermissionDeniedError(Exception):
    """A credential was presented but does not permit the operation. Mapped to HTTP 403."""
