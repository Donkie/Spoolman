"""Authentication and authorization.

Everything in this package is inert unless ``SPOOLMAN_AUTH_ENABLED`` is set. With it
unset, permission gates short-circuit to an unrestricted principal before touching the
database, so an instance behaves exactly as it did before authentication existed.

The permission model has two orthogonal axes:

* **Level** -- an ordered ``read < edit < manage`` scale carried by users and, from
  phase 2, by API keys. ``read`` covers every GET, ``edit`` adds modification of
  existing records, and ``manage`` adds creation and deletion.
* **Flags** -- ``is_admin`` (administers other users) and ``is_owner`` (exactly one per
  instance; promotes admins and cannot be demoted by anyone else). Both imply
  ``manage``.
"""
