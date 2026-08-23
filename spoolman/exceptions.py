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

    Carries the conflicting spool's ID rather than only a message, so the API can hand it
    to the client and the client can offer "move the tag to this spool instead" without a
    second lookup.

    `spool_id` is None when the UID is held by something that is not a spool -- a tag
    identifies exactly one thing, and not every such thing is a spool (see
    `database.models.Tag`). The message says what in that case, and a client with nothing
    to offer beyond it simply reports it.
    """

    def __init__(self, message: str, spool_id: int | None = None) -> None:
        """Initialize with the message and the ID of the spool already holding the tag."""
        super().__init__(message)
        self.spool_id = spool_id
