import qrcode from "qrcode-generator";

export type QrEcLevel = "L" | "M" | "Q" | "H";
export type QrMode = "Numeric" | "Alphanumeric" | "Byte";

const NUMERIC = /^[0-9]+$/;
/** The QR alphanumeric charset (ISO/IEC 18004): digits, upper-case letters and " $%*+-./:". */
const ALPHANUMERIC = /^[0-9A-Z $%*+\-./:]+$/;

/**
 * The densest QR encoding mode that can represent the payload. The default
 * `WEB+SPOOLMAN:F-<id>` payloads are all-uppercase on purpose: alphanumeric
 * mode packs them into a QR one version smaller than byte mode (21 instead of
 * 25 modules), which prints larger, cleaner modules in the same area.
 */
export function pickQrMode(payload: string): QrMode {
  if (NUMERIC.test(payload)) return "Numeric";
  if (ALPHANUMERIC.test(payload)) return "Alphanumeric";
  return "Byte";
}

/**
 * Encode a payload as a QR symbol and return its module matrix
 * (row-major, true = dark module). The smallest version that fits is used.
 */
export function makeQrModules(payload: string, ecLevel: QrEcLevel = "M"): boolean[][] {
  const qr = qrcode(0, ecLevel);
  qr.addData(payload, pickQrMode(payload));
  qr.make();
  const count = qr.getModuleCount();
  const modules: boolean[][] = [];
  for (let row = 0; row < count; row++) {
    const cells: boolean[] = [];
    for (let col = 0; col < count; col++) {
      cells.push(qr.isDark(row, col));
    }
    modules.push(cells);
  }
  return modules;
}
