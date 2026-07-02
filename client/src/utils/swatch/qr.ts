import qrcode from "qrcode-generator";

export type QrEcLevel = "L" | "M" | "Q" | "H";

/**
 * Encode a payload as a QR symbol and return its module matrix
 * (row-major, true = dark module). The smallest version that fits is used.
 */
export function makeQrModules(payload: string, ecLevel: QrEcLevel = "M"): boolean[][] {
  const qr = qrcode(0, ecLevel);
  qr.addData(payload);
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
