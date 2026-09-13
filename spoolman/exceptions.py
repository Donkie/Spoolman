"""Various exceptions used."""


class ItemNotFoundError(Exception):
    pass


class ItemDeleteError(Exception):
    pass


class ItemCreateError(Exception):
    pass


class SpoolMeasureError(Exception):
    pass


class TagConflictError(Exception):
    """A tag UID is already linked to something else.

    Carries the holder's ID rather than only a message, so the API can hand it to the
    client and the client can offer "move the tag here instead" without a second lookup.

    At most one of `spool_id` and `filament_id` is set, naming whichever holds the tag.
    Both are None when the holder is not a row at all (see `database.models.Tag`); the
    message says what in that case, and a client with nothing to offer beyond it simply
    reports it.
    """

    def __init__(self, message: str, spool_id: int | None = None, filament_id: int | None = None) -> None:
        """Initialize with the message and the ID of the spool or filament holding the tag."""
        super().__init__(message)
        self.spool_id = spool_id
        self.filament_id = filament_id
