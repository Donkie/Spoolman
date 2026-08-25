"""Build a synthetic OpenPrintTag NFC-V memory dump for integration tests.

Same construction as spoolman's own unit tests (tests/test_openprinttag_codec.py,
tests/test_tag_decode.py), duplicated here rather than imported: this package runs inside
the separate `spoolman-tester` container/image, which has no access to the `spoolman`
package's own test modules, only to `spoolman-tester`'s own requirements.txt (cbor2 is
added there for this).
"""

import cbor2

# Mirrors spoolman.openprinttag_codec's field keys for the handful of fields these tests
# populate. Not the full set -- see that module for the complete key vocabulary.
MF_MATERIAL_TYPE = 9
MF_MATERIAL_NAME = 10
MF_BRAND_NAME = 11
MF_NOMINAL_NETTO_FULL_WEIGHT = 16
MF_EMPTY_CONTAINER_WEIGHT = 18
MF_PRIMARY_COLOR = 19
MF_DENSITY = 29
MF_FILAMENT_DIAMETER = 30

META_AUX_REGION_OFFSET = 2
AUX_CONSUMED_WEIGHT = 0

MATERIAL_TYPE_PLA = 0
MATERIAL_TYPE_PETG = 1


def _cbor_payload(main: dict, aux: dict | None = None) -> bytes:
    if aux is None:
        return cbor2.dumps({}) + cbor2.dumps(main)

    meta: dict = {}
    aux_offset = 0
    for _ in range(4):
        meta[META_AUX_REGION_OFFSET] = aux_offset
        meta_bytes = cbor2.dumps(meta)
        main_bytes = cbor2.dumps(main)
        new_offset = len(meta_bytes) + len(main_bytes)
        if new_offset == aux_offset:
            break
        aux_offset = new_offset
    return meta_bytes + main_bytes + cbor2.dumps(aux)


def _ndef_short_record(mime: str, payload: bytes) -> bytes:
    mime_bytes = mime.encode("ascii")
    header = 0b11010010  # MB=1 ME=1 CF=0 SR=1 IL=0 TNF=0x02
    return bytes([header, len(mime_bytes), len(payload)]) + mime_bytes + payload


def _nfcv_memory(ndef_message: bytes) -> bytes:
    cc = bytes([0xE1, 0x40, 0x00, 0x01])
    tlv = bytes([0x03, len(ndef_message)]) + ndef_message + bytes([0xFE])
    return cc + tlv


def build_openprinttag(main: dict, aux: dict | None = None) -> bytes:
    """Build a full NFC-V memory dump wrapping an OpenPrintTag NDEF record."""
    payload = _cbor_payload(main, aux)
    ndef = _ndef_short_record("application/vnd.openprinttag", payload)
    return _nfcv_memory(ndef)
