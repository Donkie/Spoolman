"""Command line administration for authentication.

Run as ``python -m spoolman.cli``, rather than as an installed console script, because
the Docker image runs Spoolman from source:

    docker exec -it spoolman python -m spoolman.cli auth status

This is the way back in when nobody can sign in -- a forgotten owner password, a
disabled account, an instance whose owner has left. It is the reason no per-user
recovery codes exist.

It talks to the database directly using the same environment configuration as the
server, and never runs migrations: if the schema is missing it says so and stops, since
the fix is to start the server once and let it migrate.

It also works while SPOOLMAN_AUTH_ENABLED is unset, which is deliberate -- the intended
first run is to create an owner and only then turn authentication on.
"""

# ruff: noqa: T201

import argparse
import asyncio
import secrets
import sys
from datetime import datetime

import sqlalchemy
from sqlalchemy.ext.asyncio import AsyncSession

from spoolman.auth.hashing import hash_password
from spoolman.auth.levels import Level, parse_level
from spoolman.database import auth_session as auth_session_db
from spoolman.database import auth_user as auth_user_db
from spoolman.database import database, models

# Long enough that a generated password is not worth attacking, short enough to retype
# from a terminal into a browser.
GENERATED_PASSWORD_BYTES = 12

EXIT_OK = 0
EXIT_ERROR = 1
EXIT_NO_SCHEMA = 2


async def _require_schema() -> None:
    """Stop unless the auth tables exist."""

    def _tables(connection: sqlalchemy.Connection) -> list[str]:
        return sqlalchemy.inspect(connection).get_table_names()

    async with database.get_engine().connect() as connection:
        tables = await connection.run_sync(_tables)

    if "auth_user" not in tables:
        print(
            "Spoolman's authentication tables are missing. Start the Spoolman server "
            "once so it can migrate the database, then run this command again.",
        )
        raise SystemExit(EXIT_NO_SCHEMA)


def _generate_password() -> str:
    """Make a password that is safe to hand to someone once."""
    return secrets.token_urlsafe(GENERATED_PASSWORD_BYTES)


def _describe(user: models.AuthUser) -> str:
    """Format a user as one line for `user list`."""
    flags = []
    if user.is_owner:
        flags.append("owner")
    if user.is_admin:
        flags.append("admin")
    if not user.is_active:
        flags.append("disabled")
    if user.must_change_password:
        flags.append("must-change-password")
    if user.locked_until is not None and user.locked_until > datetime.utcnow():
        flags.append(f"locked until {user.locked_until:%Y-%m-%d %H:%M} UTC")
    last = f"{user.last_login:%Y-%m-%d %H:%M}" if user.last_login else "never"
    return f"  {user.username:<24} {user.level:<7} last login: {last:<17} {' '.join(flags)}"


async def _cmd_auth_status(args: argparse.Namespace, db: AsyncSession) -> int:  # noqa: ARG001
    """Report the state of authentication on this instance."""
    from spoolman import env  # noqa: PLC0415

    users, total = await auth_user_db.find(db=db)
    owners = [u for u in users if u.is_owner]

    print(f"Authentication enabled : {'yes' if env.is_auth_enabled() else 'no (SPOOLMAN_AUTH_ENABLED is not set)'}")
    print(f"User accounts          : {total}")
    print(f"Owner                  : {owners[0].username if owners else 'none - the instance is unclaimed'}")
    if total == 0:
        print()
        print("Nobody can sign in yet. Either create an account here, or start the server")
        print("with authentication enabled and claim it from the web interface.")
    return EXIT_OK


async def _cmd_user_list(args: argparse.Namespace, db: AsyncSession) -> int:  # noqa: ARG001
    """List every account."""
    users, total = await auth_user_db.find(db=db)
    if total == 0:
        print("No user accounts exist.")
        return EXIT_OK
    print(f"{total} user account(s):")
    for user in users:
        print(_describe(user))
    return EXIT_OK


async def _cmd_user_create(args: argparse.Namespace, db: AsyncSession) -> int:
    """Create an account and print its generated password."""
    existing = await auth_user_db.get_by_username(db, args.username)
    if existing is not None:
        print(f"A user named {existing.username!r} already exists.")
        return EXIT_ERROR

    if args.owner:
        existing_users, _ = await auth_user_db.find(db=db)
        owners = [u for u in existing_users if u.is_owner]
        if owners:
            print(
                f"This instance is already owned by {owners[0].username!r}. There is exactly one owner; "
                "transfer ownership from the web interface instead.",
            )
            return EXIT_ERROR

    # Administering other users implies being able to manage data, so an owner or admin
    # is always at manage. Without this, "user create <name> --owner" would take the
    # default level and produce an owner who cannot change anything.
    is_admin = args.admin or args.owner
    level = parse_level(args.level) if args.level is not None else Level.READ
    if is_admin and level is not Level.MANAGE:
        if args.level is not None:
            print(f"Ignoring --level {level}: an admin or owner is always at {Level.MANAGE}.")
        level = Level.MANAGE

    password = _generate_password()
    user = await auth_user_db.create(
        db=db,
        username=args.username,
        password_hash=hash_password(password),
        level=level,
        is_admin=is_admin,
        is_owner=args.owner,
        display_name=args.display_name,
    )
    print(f"Created {user.username!r} with level {user.level}.")
    print(f"  Password: {password}")
    print("  This is shown once. Give it to the user and have them change it.")
    return EXIT_OK


async def _cmd_user_reset_password(args: argparse.Namespace, db: AsyncSession) -> int:
    """Give an account a new one-time password."""
    user = await auth_user_db.get_by_username(db, args.username)
    if user is None:
        print(f"No user named {args.username!r}.")
        return EXIT_ERROR

    password = _generate_password()
    await auth_user_db.set_password(
        db=db,
        user=user,
        password_hash=hash_password(password),
        must_change=True,
    )
    revoked = await auth_session_db.revoke_all_for_user(db, user.id)
    print(f"Reset the password for {user.username!r}.")
    print(f"  Password: {password}")
    print(f"  They must change it at next sign-in. {revoked} existing session(s) were ended.")
    return EXIT_OK


async def _cmd_user_set_level(args: argparse.Namespace, db: AsyncSession) -> int:
    """Change an account's permission level."""
    user = await auth_user_db.get_by_username(db, args.username)
    if user is None:
        print(f"No user named {args.username!r}.")
        return EXIT_ERROR
    level = parse_level(args.level)
    user.level = str(level)
    await db.commit()
    print(f"{user.username!r} is now at level {level}.")
    return EXIT_OK


async def _cmd_user_enable(args: argparse.Namespace, db: AsyncSession) -> int:
    """Re-enable an account and clear any lockout."""
    user = await auth_user_db.get_by_username(db, args.username)
    if user is None:
        print(f"No user named {args.username!r}.")
        return EXIT_ERROR
    user.is_active = True
    user.failed_logins = 0
    user.locked_until = None
    await db.commit()
    print(f"{user.username!r} is enabled, and any lockout has been cleared.")
    return EXIT_OK


async def _cmd_user_disable(args: argparse.Namespace, db: AsyncSession) -> int:
    """Disable an account and end its sessions."""
    user = await auth_user_db.get_by_username(db, args.username)
    if user is None:
        print(f"No user named {args.username!r}.")
        return EXIT_ERROR
    if user.is_owner:
        print("The owner cannot be disabled. Transfer ownership first.")
        return EXIT_ERROR
    user.is_active = False
    await db.commit()
    revoked = await auth_session_db.revoke_all_for_user(db, user.id)
    print(f"{user.username!r} is disabled. {revoked} session(s) were ended.")
    return EXIT_OK


async def _cmd_session_revoke_all(args: argparse.Namespace, db: AsyncSession) -> int:
    """Sign out one user, or everyone."""
    if args.user:
        user = await auth_user_db.get_by_username(db, args.user)
        if user is None:
            print(f"No user named {args.user!r}.")
            return EXIT_ERROR
        revoked = await auth_session_db.revoke_all_for_user(db, user.id)
        print(f"Ended {revoked} session(s) for {user.username!r}.")
        return EXIT_OK

    users, _ = await auth_user_db.find(db=db)
    revoked = 0
    for user in users:
        revoked += await auth_session_db.revoke_all_for_user(db, user.id)
    print(f"Ended {revoked} session(s) across all users.")
    return EXIT_OK


def _build_parser() -> argparse.ArgumentParser:
    """Build the argument parser."""
    parser = argparse.ArgumentParser(
        prog="python -m spoolman.cli",
        description=(
            "Administer Spoolman authentication from the host. Use this to create the "
            "first account, or to get back in when nobody can sign in."
        ),
    )
    commands = parser.add_subparsers(dest="group", required=True)

    auth = commands.add_parser("auth", help="Inspect authentication state.")
    auth_sub = auth.add_subparsers(dest="command", required=True)
    auth_sub.add_parser("status", help="Show whether auth is on, and who owns the instance.").set_defaults(
        func=_cmd_auth_status,
    )

    user = commands.add_parser("user", help="Manage user accounts.")
    user_sub = user.add_subparsers(dest="command", required=True)

    user_sub.add_parser("list", help="List all accounts.").set_defaults(func=_cmd_user_list)

    create = user_sub.add_parser("create", help="Create an account and print a generated password.")
    create.add_argument("username")
    create.add_argument(
        "--level",
        default=None,
        choices=[str(level) for level in Level],
        help=f"Permission level. Defaults to {Level.READ}, or {Level.MANAGE} with --admin or --owner.",
    )
    create.add_argument("--admin", action="store_true", help="Let this user administer other users.")
    create.add_argument("--owner", action="store_true", help="Make this user the instance owner. Implies --admin.")
    create.add_argument("--display-name", default=None)
    create.set_defaults(func=_cmd_user_create)

    reset = user_sub.add_parser("reset-password", help="Set a new one-time password and end their sessions.")
    reset.add_argument("username")
    reset.set_defaults(func=_cmd_user_reset_password)

    set_level = user_sub.add_parser("set-level", help="Change an account's permission level.")
    set_level.add_argument("username")
    set_level.add_argument("level", choices=[str(level) for level in Level])
    set_level.set_defaults(func=_cmd_user_set_level)

    enable = user_sub.add_parser("enable", help="Re-enable an account and clear any lockout.")
    enable.add_argument("username")
    enable.set_defaults(func=_cmd_user_enable)

    disable = user_sub.add_parser("disable", help="Disable an account and end its sessions.")
    disable.add_argument("username")
    disable.set_defaults(func=_cmd_user_disable)

    session = commands.add_parser("session", help="Manage login sessions.")
    session_sub = session.add_subparsers(dest="command", required=True)
    revoke = session_sub.add_parser("revoke-all", help="Sign out everyone, or one user.")
    revoke.add_argument("--user", default=None, help="Limit to this username.")
    revoke.set_defaults(func=_cmd_session_revoke_all)

    return parser


async def _run(args: argparse.Namespace) -> int:
    """Connect to the database and dispatch the command."""
    database.setup_db(database.get_connection_url())
    await _require_schema()

    generator = database.get_db_session()
    db = await anext(generator)
    try:
        return await args.func(args, db)
    finally:
        await generator.aclose()


def main() -> None:
    """Run the command line interface."""
    args = _build_parser().parse_args()
    try:
        sys.exit(asyncio.run(_run(args)))
    except SystemExit:
        raise
    except ValueError as exc:
        print(f"Error: {exc}")
        sys.exit(EXIT_ERROR)


if __name__ == "__main__":
    main()
