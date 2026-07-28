"""The authenticated identity behind a request."""

from dataclasses import dataclass
from enum import StrEnum
from typing import Final

from spoolman.auth.levels import Level, covers


class PrincipalKind(StrEnum):
    """How a principal was established."""

    USER = "user"
    APIKEY = "apikey"
    CERT = "cert"
    ANONYMOUS = "anonymous"
    DISABLED = "disabled"


@dataclass(frozen=True, slots=True)
class Principal:
    """Who is making a request, and what they may do.

    The absence of a credential is represented by ``None`` rather than by a Principal,
    so a caller can never accidentally treat "nobody" as a permission holder.
    """

    kind: PrincipalKind
    level: Level
    user_id: int | None = None
    username: str | None = None
    is_admin: bool = False
    is_owner: bool = False
    session_id: int | None = None
    api_key_id: int | None = None
    # Multi-tenancy seam (see AUTHENTICATION_PLAN.md). Always None today. It exists now
    # so that every auth database function already threads a tenant through its
    # signature, and adding tenancy later becomes a filter inside those functions
    # rather than a change to forty routers.
    tenant_id: int | None = None

    def covers(self, required: Level) -> bool:
        """Check whether this principal satisfies a level requirement.

        Args:
            required: The level demanded.

        Returns:
            bool: True if permitted.

        """
        return covers(self.level, required)


# Returned by every gate when SPOOLMAN_AUTH_ENABLED is unset, before any database access
# happens. This is what keeps the auth-disabled request path identical to an instance
# built before authentication existed.
UNRESTRICTED: Final = Principal(
    kind=PrincipalKind.DISABLED,
    level=Level.MANAGE,
    is_admin=True,
    is_owner=True,
)

# Granted when the auth_anonymous_read setting is on and no credential was presented.
ANONYMOUS_READER: Final = Principal(kind=PrincipalKind.ANONYMOUS, level=Level.READ)
