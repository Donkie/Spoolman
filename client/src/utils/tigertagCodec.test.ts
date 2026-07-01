import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IFilament } from "../pages/filaments/model";
import { ISpool } from "../pages/spools/model";
import {
  TigerTagBinaryData,
  TIGERTAG_EPOCH_OFFSET,
  TIGERTAG_MAKER_V1,
  decodeTigerTag,
  encodeTigerTag,
  isTigerTag,
  mapSpoolToTigerTag,
} from "./tigertagCodec";

// --- Fixtures ---------------------------------------------------------------

function filament(over: Partial<IFilament> = {}): IFilament {
  return { id: 1, registered: "2024-01-01", density: 1.24, diameter: 1.75, extra: {}, ...over };
}

let nextId = 1;
function spool(over: Partial<ISpool> = {}): ISpool {
  const { filament: fil, ...rest } = over;
  return {
    id: nextId++,
    registered: "2024-01-01T00:00:00Z",
    filament: fil ?? filament(),
    used_weight: 0,
    used_length: 0,
    archived: false,
    extra: {},
    ...rest,
  };
}

const NTAG213_USER_BYTES = 144;

/**
 * Build a 144-byte TigerTag payload straight from the documented wire spec.
 *
 * This is the SAME golden vector used by the Python codec test in
 * tests/nfc/test_tigertag_codec.py. It is hand-assembled byte-by-byte (NOT
 * produced by encodeTigerTag) so that asserting decodeTigerTag against it
 * proves the two independent codecs agree on the wire format.
 */
function goldenPayload(): ArrayBuffer {
  const buf = new ArrayBuffer(NTAG213_USER_BYTES);
  const view = new DataView(buf);
  const BE = false; // DataView littleEndian=false -> big-endian

  view.setUint32(0, 0x5bf59264, BE); // id_tigertag = TigerTag Maker v1
  view.setUint32(4, 42, BE); // id_product   = 42
  view.setUint16(8, 7, BE); // id_material  = 7
  view.setUint8(10, 3); // aspect_1     = 3
  view.setUint8(11, 0); // aspect_2     = 0 (ignored by decoder)
  view.setUint8(12, 142); // id_type      = 142 (filament)
  view.setUint8(13, 1); // id_diameter  = 1 -> 1.75 mm
  view.setUint16(14, 5, BE); // id_brand     = 5
  view.setUint32(16, 0xff8800ff, BE); // color RGBA = #ff8800, alpha 255
  view.setUint32(20, 0x0003e801, BE); // weight_unit = (1000<<8)|1 -> 1000 g
  view.setUint16(24, 210, BE); // nozzle_min   = 210
  view.setUint16(26, 230, BE); // nozzle_max   = 230
  view.setUint8(28, 80); // drying_temp  = 80
  view.setUint8(29, 8); // drying_time  = 8 h
  view.setUint16(30, 0, BE); // reserved
  view.setUint32(32, 0x30000000, BE); // timestamp    = 0x30000000
  view.setUint8(36, 60); // bed_temp_min = 60
  view.setUint8(37, 70); // bed_temp_max = 70
  view.setUint32(54, 0x0001f600, BE); // emoji        = U+1F600

  const msg = new TextEncoder().encode("PLA Orange");
  new Uint8Array(buf).set(msg, 58); // user_message (null-padded to 28)

  return buf;
}

// --- Golden vector (cross-implementation equivalence) ------------------------

describe("decodeTigerTag - golden vector", () => {
  it("decodes every field to the value planted at its documented offset", () => {
    const data = decodeTigerTag(goldenPayload());

    expect(data.id_tigertag).toBe(TIGERTAG_MAKER_V1);
    expect(data.id_tigertag).toBe(0x5bf59264);
    expect(isTigerTag(data.id_tigertag)).toBe(true);
    expect(data.id_product).toBe(42);
    expect(data.id_material).toBe(7);
    expect(data.id_aspect).toBe(3);
    expect(data.id_type).toBe(142);
    expect(data.id_diameter).toBe(1);
    expect(data.id_brand).toBe(5);
    expect([data.color_r, data.color_g, data.color_b, data.color_a]).toEqual([255, 136, 0, 255]);
    expect(data.weight).toBe(1000);
    expect(data.nozzle_temp).toBe(210);
    expect(data.nozzle_temp_max).toBe(230);
    expect(data.drying_temp).toBe(80);
    expect(data.drying_duration).toBe(8);
    expect(data.timestamp).toBe(0x30000000);
    expect(data.bed_temp).toBe(60);
    expect(data.bed_temp_max).toBe(70);
    expect(data.emoji).toBe(0x0001f600);
    expect(data.user_message).toBe("PLA Orange");
  });
});

// --- Round-trip -------------------------------------------------------------

describe("encodeTigerTag / decodeTigerTag round-trip", () => {
  it("encode -> decode is loss-free for a hand-built struct within wire ranges", () => {
    const data: TigerTagBinaryData = {
      id_tigertag: TIGERTAG_MAKER_V1,
      id_product: 0x12345678,
      id_material: 0xabcd,
      id_diameter: 2,
      id_aspect: 3,
      id_type: 142,
      id_brand: 0x0102,
      color_r: 10,
      color_g: 20,
      color_b: 30,
      color_a: 200,
      weight: 750,
      nozzle_temp: 215,
      nozzle_temp_max: 225,
      bed_temp: 60,
      bed_temp_max: 65,
      drying_temp: 55,
      drying_duration: 6,
      timestamp: 0x30000000,
      emoji: 0x0001f600,
      user_message: "Sunset Orange PLA",
    };

    const encoded = encodeTigerTag(data);
    expect(encoded.byteLength).toBe(NTAG213_USER_BYTES);

    const decoded = decodeTigerTag(encoded);
    expect(decoded).toEqual(data);
  });

  it("encodeTigerTag always emits exactly the NTAG213 user-memory size", () => {
    const minimal: TigerTagBinaryData = {
      id_tigertag: 0,
      id_product: 0,
      id_material: 0,
      id_diameter: 0,
      id_aspect: 0,
      id_type: 0,
      id_brand: 0,
      color_r: 0,
      color_g: 0,
      color_b: 0,
      color_a: 0,
      weight: 0,
      nozzle_temp: 0,
      nozzle_temp_max: 0,
      bed_temp: 0,
      bed_temp_max: 0,
      drying_temp: 0,
      drying_duration: 0,
      timestamp: 0,
      emoji: 0,
      user_message: "",
    };
    expect(encodeTigerTag(minimal).byteLength).toBe(144);
  });
});

// --- Defensive contract -----------------------------------------------------

describe("decodeTigerTag - short buffer", () => {
  it("throws on a buffer smaller than the 36-byte header", () => {
    expect(() => decodeTigerTag(new ArrayBuffer(35))).toThrow(/too short/);
  });
});

describe("encodeTigerTag - user_message truncation", () => {
  it("truncates a message longer than the 28-byte field on encode -> decode", () => {
    const data: TigerTagBinaryData = {
      id_tigertag: TIGERTAG_MAKER_V1,
      id_product: 1,
      id_material: 0,
      id_diameter: 1,
      id_aspect: 0,
      id_type: 142,
      id_brand: 0,
      color_r: 0,
      color_g: 0,
      color_b: 0,
      color_a: 255,
      weight: 0,
      nozzle_temp: 0,
      nozzle_temp_max: 0,
      bed_temp: 0,
      bed_temp_max: 0,
      drying_temp: 0,
      drying_duration: 0,
      timestamp: 0,
      emoji: 0,
      user_message: "x".repeat(40),
    };
    const decoded = decodeTigerTag(encodeTigerTag(data));
    expect(decoded.user_message).toBe("x".repeat(28));
  });
});

// --- mapSpoolToTigerTag -----------------------------------------------------

describe("mapSpoolToTigerTag", () => {
  // 2024-01-01T00:00:00Z in Unix seconds is 1704067200. After subtracting the
  // TigerTag epoch offset this is a fixed, deterministic value.
  const fixedUnixMs = Date.UTC(2024, 0, 1, 0, 0, 0);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(fixedUnixMs));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses a deterministic timestamp relative to the TigerTag epoch", () => {
    const data = mapSpoolToTigerTag(spool({ filament: filament() }));
    const expected = Math.floor(fixedUnixMs / 1000) - TIGERTAG_EPOCH_OFFSET;
    expect(data.timestamp).toBe(expected);
  });

  it("always identifies as a filament TigerTag", () => {
    const data = mapSpoolToTigerTag(spool({ filament: filament() }));
    expect(data.id_type).toBe(142);
    expect(data.id_tigertag).toBe(TIGERTAG_MAKER_V1);
  });

  it("derives id_product from a tigertag_ external_id", () => {
    const data = mapSpoolToTigerTag(spool({ filament: filament({ external_id: "tigertag_28" }) }));
    expect(data.id_product).toBe(28);
  });

  it("falls back to spool.id for a malformed external_id", () => {
    const s = spool({ id: 999, filament: filament({ external_id: "tigertag_abc" }) });
    const data = mapSpoolToTigerTag(s);
    expect(data.id_product).toBe(999);
  });

  it("falls back to spool.id when no external_id is present", () => {
    const s = spool({ id: 777, filament: filament() });
    const data = mapSpoolToTigerTag(s);
    expect(data.id_product).toBe(777);
  });

  it("maps diameter 1.75 -> 1 and 2.85 -> 2", () => {
    expect(mapSpoolToTigerTag(spool({ filament: filament({ diameter: 1.75 }) })).id_diameter).toBe(1);
    expect(mapSpoolToTigerTag(spool({ filament: filament({ diameter: 2.85 }) })).id_diameter).toBe(2);
  });

  it("parses color_hex into r/g/b channels", () => {
    const data = mapSpoolToTigerTag(spool({ filament: filament({ color_hex: "#ff8800" }) }));
    expect([data.color_r, data.color_g, data.color_b]).toEqual([255, 136, 0]);
    expect(data.color_a).toBe(255);
  });

  it("truncates filament weight to a whole gram, matching the Python backend's int()", () => {
    const data = mapSpoolToTigerTag(spool({ filament: filament({ weight: 999.6 }) }));
    expect(data.weight).toBe(999);
  });
});

// Mutation-testing-driven coverage (Stryker): the length guards and defaults for the
// trailing fields (bed temps, emoji, message) are only exercised by truncated buffers.
describe("isTigerTag", () => {
  it("returns false for magic numbers that are not a TigerTag", () => {
    expect(isTigerTag(0x12345678)).toBe(false);
    expect(isTigerTag(0)).toBe(false);
  });
});

describe("decodeTigerTag with truncated-but-valid buffers", () => {
  it("decodes a header-only (36-byte) buffer, defaulting the trailing fields", () => {
    const data = decodeTigerTag(goldenPayload().slice(0, 36));
    // Header fields still decode correctly.
    expect(data.id_tigertag).toBe(TIGERTAG_MAKER_V1);
    expect(data.weight).toBe(1000);
    // Fields past the header are absent, so they take their defaults (no over-read).
    expect(data.bed_temp).toBe(0);
    expect(data.bed_temp_max).toBe(0);
    expect(data.emoji).toBe(0);
    expect(data.user_message).toBe("");
  });

  it("reads the bed temps once the buffer includes them (38 bytes), still defaulting emoji/message", () => {
    const data = decodeTigerTag(goldenPayload().slice(0, 38));
    expect(data.bed_temp).toBe(60);
    expect(data.bed_temp_max).toBe(70);
    expect(data.emoji).toBe(0);
    expect(data.user_message).toBe("");
  });

  it("reads the emoji once the buffer includes it (58 bytes), still defaulting the message", () => {
    const data = decodeTigerTag(goldenPayload().slice(0, 58));
    expect(data.emoji).toBe(0x0001f600);
    expect(data.user_message).toBe("");
  });

  it("reads the user message once the buffer includes it (86 bytes)", () => {
    const data = decodeTigerTag(goldenPayload().slice(0, 86));
    expect(data.user_message).toBe("PLA Orange");
  });
});
