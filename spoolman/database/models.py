"""SQLAlchemy data models."""

from datetime import datetime

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.ext.asyncio import AsyncAttrs
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

# The three `extra` collections below MUST NOT go back to lazy="joined".
#
# A spool listing joins spool -> filament -> vendor, so joined eager loading of all
# three `extra` collections multiplies their rows together: with ~12 spool, ~9
# filament and ~9 vendor extra fields, one spool costs ~1000 result rows. Measured
# on a 4911-spool database, a single `GET /spool?limit=30` made SQLite materialize
# 35674 wide rows and took 431 ms (1358 ms at limit=100) — most of it spent in
# SQLAlchemy de-duplicating those rows back into 30 objects.
#
# selectin loading fetches each collection in one extra `WHERE id IN (...)` query
# instead, so nothing multiplies: the same request drops to 12 ms / 23 ms (5
# queries instead of 2) with byte-identical responses.


class Base(AsyncAttrs, DeclarativeBase):
    pass


class Vendor(Base):
    __tablename__ = "vendor"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    registered: Mapped[datetime] = mapped_column()
    name: Mapped[str] = mapped_column(String(64))
    empty_spool_weight: Mapped[float | None] = mapped_column(comment="The weight of an empty spool.")
    comment: Mapped[str | None] = mapped_column(String(1024))
    filaments: Mapped[list[Filament]] = relationship(back_populates="vendor")
    external_id: Mapped[str | None] = mapped_column(String(256))
    extra: Mapped[list[VendorField]] = relationship(
        back_populates="vendor",
        cascade="save-update, merge, delete, delete-orphan",
        lazy="selectin",
    )


class Filament(Base):
    __tablename__ = "filament"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    registered: Mapped[datetime] = mapped_column()
    name: Mapped[str | None] = mapped_column(String(64))
    vendor_id: Mapped[int | None] = mapped_column(ForeignKey("vendor.id"))
    vendor: Mapped[Vendor | None] = relationship(back_populates="filaments")
    spools: Mapped[list[Spool]] = relationship(back_populates="filament")
    material: Mapped[str | None] = mapped_column(String(64))
    price: Mapped[float | None] = mapped_column()
    density: Mapped[float] = mapped_column()
    diameter: Mapped[float] = mapped_column()
    weight: Mapped[float | None] = mapped_column(comment="The filament weight of a full spool (net weight).")
    spool_weight: Mapped[float | None] = mapped_column(comment="The weight of an empty spool.")
    article_number: Mapped[str | None] = mapped_column(String(64))
    comment: Mapped[str | None] = mapped_column(String(1024))
    settings_extruder_temp: Mapped[int | None] = mapped_column(comment="Overridden extruder temperature.")
    settings_bed_temp: Mapped[int | None] = mapped_column(comment="Overridden bed temperature.")
    color_hex: Mapped[str | None] = mapped_column(String(8))
    multi_color_hexes: Mapped[str | None] = mapped_column(String(128))
    multi_color_direction: Mapped[str | None] = mapped_column(String(16))
    external_id: Mapped[str | None] = mapped_column(String(256))
    extra: Mapped[list[FilamentField]] = relationship(
        back_populates="filament",
        cascade="save-update, merge, delete, delete-orphan",
        lazy="selectin",
    )


class Spool(Base):
    __tablename__ = "spool"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    registered: Mapped[datetime] = mapped_column()
    first_used: Mapped[datetime | None] = mapped_column()
    last_used: Mapped[datetime | None] = mapped_column()
    price: Mapped[float | None] = mapped_column()
    filament_id: Mapped[int] = mapped_column(ForeignKey("filament.id"))
    filament: Mapped[Filament] = relationship(back_populates="spools")
    initial_weight: Mapped[float | None] = mapped_column()
    spool_weight: Mapped[float | None] = mapped_column()
    used_weight: Mapped[float] = mapped_column()
    location: Mapped[str | None] = mapped_column(String(64))
    lot_nr: Mapped[str | None] = mapped_column(String(64))
    comment: Mapped[str | None] = mapped_column(String(1024))
    archived: Mapped[bool | None] = mapped_column()
    extra: Mapped[list[SpoolField]] = relationship(
        back_populates="spool",
        cascade="save-update, merge, delete, delete-orphan",
        lazy="selectin",
    )


class Setting(Base):
    __tablename__ = "setting"

    key: Mapped[str] = mapped_column(String(64), primary_key=True, index=True)
    value: Mapped[str] = mapped_column(Text())
    last_updated: Mapped[datetime] = mapped_column()


class VendorField(Base):
    __tablename__ = "vendor_field"

    vendor_id: Mapped[int] = mapped_column(ForeignKey("vendor.id"), primary_key=True, index=True)
    vendor: Mapped[Vendor] = relationship(back_populates="extra")
    key: Mapped[str] = mapped_column(String(64), primary_key=True, index=True)
    value: Mapped[str] = mapped_column(Text())


class FilamentField(Base):
    __tablename__ = "filament_field"

    filament_id: Mapped[int] = mapped_column(ForeignKey("filament.id"), primary_key=True, index=True)
    filament: Mapped[Filament] = relationship(back_populates="extra")
    key: Mapped[str] = mapped_column(String(64), primary_key=True, index=True)
    value: Mapped[str] = mapped_column(Text())


class SpoolField(Base):
    __tablename__ = "spool_field"

    spool_id: Mapped[int] = mapped_column(ForeignKey("spool.id"), primary_key=True, index=True)
    spool: Mapped[Spool] = relationship(back_populates="extra")
    key: Mapped[str] = mapped_column(String(64), primary_key=True, index=True)
    value: Mapped[str] = mapped_column(Text())


# The authentication tables below are all prefixed `auth_`, because `user` and `session`
# are reserved words in PostgreSQL and MySQL and quoting them at every call site is a
# footgun not worth taking.
#
# None of them declare a relationship(). Auth lookups are single-row queries by an
# indexed column, so there is nothing to eager-load; a `sessions` collection on AuthUser
# would fetch every session row on every login for no benefit, and lazy-loading one
# under asyncio raises MissingGreenlet. Related rows are queried and deleted explicitly.
#
# Enum-valued columns are stored as String, matching `multi_color_direction` above --
# there is not one sa.Enum in this schema, and adding one would create a native
# PostgreSQL type and a MySQL ENUM(...) with three different ALTER dialects.
#
# Multi-tenancy seam (see AUTHENTICATION_PLAN.md): every table uses an integer surrogate
# primary key so a tenant_id foreign key is a pure add-column later. Uniqueness is
# enforced by unique *indexes* rather than named UNIQUE constraints, so
# `auth_user.username` can become a composite (tenant_id, username) index without having
# to drop a constraint whose generated name differs per dialect. `auth_api_key.prefix`
# stays globally unique even then: it is a lookup key, not a name.


class AuthUser(Base):
    """A user account. Used from phase 1."""

    __tablename__ = "auth_user"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(64), index=True, unique=True, comment="Stored lowercased.")
    display_name: Mapped[str | None] = mapped_column(String(128))
    email: Mapped[str | None] = mapped_column(String(256), comment="Used for OIDC matching only, never delivery.")
    password_hash: Mapped[str | None] = mapped_column(Text(), comment="Null for OIDC- or certificate-only accounts.")
    level: Mapped[str] = mapped_column(String(16), comment="read, edit or manage. See spoolman.auth.levels.")
    is_admin: Mapped[bool] = mapped_column()
    is_owner: Mapped[bool] = mapped_column()
    is_active: Mapped[bool] = mapped_column()
    must_change_password: Mapped[bool] = mapped_column()
    totp_secret: Mapped[str | None] = mapped_column(Text(), comment="Fernet-encrypted. Phase 4.")
    totp_enabled: Mapped[bool] = mapped_column()
    oidc_issuer: Mapped[str | None] = mapped_column(String(256), comment="Phase 3.")
    oidc_subject: Mapped[str | None] = mapped_column(String(256), comment="Phase 3.")
    failed_logins: Mapped[int] = mapped_column()
    locked_until: Mapped[datetime | None] = mapped_column()
    registered: Mapped[datetime] = mapped_column()
    last_login: Mapped[datetime | None] = mapped_column()


class AuthSession(Base):
    """A server-side login session. Used from phase 1.

    Sessions are opaque random tokens stored as their SHA-256 digest rather than JWTs,
    so that they can be listed and revoked.
    """

    __tablename__ = "auth_session"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("auth_user.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), index=True, unique=True, comment="SHA-256 hex of the token.")
    created: Mapped[datetime] = mapped_column()
    expires: Mapped[datetime] = mapped_column()
    last_seen: Mapped[datetime] = mapped_column()
    remember: Mapped[bool] = mapped_column()
    user_agent: Mapped[str | None] = mapped_column(String(256))
    ip: Mapped[str | None] = mapped_column(String(64))


class AuthApiKey(Base):
    """A machine credential. Table created in phase 1, used from phase 2."""

    __tablename__ = "auth_api_key"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("auth_user.id"), index=True)
    name: Mapped[str] = mapped_column(String(64))
    level: Mapped[str] = mapped_column(String(16))
    prefix: Mapped[str] = mapped_column(String(16), index=True, unique=True, comment="Indexes the row at lookup.")
    key_hash: Mapped[str] = mapped_column(Text())
    created: Mapped[datetime] = mapped_column()
    expires: Mapped[datetime | None] = mapped_column()
    last_used: Mapped[datetime | None] = mapped_column()
    revoked: Mapped[bool] = mapped_column()


class AuthAuditLog(Base):
    """An audit trail entry. Table created in phase 1, used from phase 2."""

    __tablename__ = "auth_audit_log"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    date: Mapped[datetime] = mapped_column(index=True)
    event: Mapped[str] = mapped_column(String(64))
    actor_user_id: Mapped[int | None] = mapped_column(ForeignKey("auth_user.id"))
    actor_kind: Mapped[str] = mapped_column(String(16))
    target: Mapped[str | None] = mapped_column(String(128))
    ip: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(256))
    detail: Mapped[str | None] = mapped_column(Text(), comment="JSON object.")


class AuthCertificate(Base):
    """An mTLS client certificate mapped to a user. Table created in phase 1, used from phase 5."""

    __tablename__ = "auth_certificate"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("auth_user.id"), index=True)
    name: Mapped[str] = mapped_column(String(64))
    fingerprint_sha256: Mapped[str] = mapped_column(
        String(95),
        index=True,
        unique=True,
        comment="Colon-separated uppercase hex, 95 chars.",
    )
    subject_dn: Mapped[str] = mapped_column(String(512))
    created: Mapped[datetime] = mapped_column()
    last_used: Mapped[datetime | None] = mapped_column()
