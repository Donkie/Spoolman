import { DownloadOutlined } from "@ant-design/icons";
import { useTranslate } from "@refinedev/core";
import { Button, Checkbox, Col, Collapse, Divider, Form, InputNumber, Radio, Row, Slider, Space } from "antd";
import * as htmlToImage from "html-to-image";
import JSZip from "jszip";
import { ReactElement, useContext, useRef } from "react";
import { ColorModeContext } from "../../contexts/color-mode";
import { useSavedState } from "../../utils/saveload";
import { PrintSettings } from "./printing";

interface ExportDialogProps {
  items: ReactElement[];
  printSettings: PrintSettings;
  setPrintSettings: (setPrintSettings: PrintSettings) => void;
  style?: string;
  extraSettings?: ReactElement;
  extraSettingsStart?: ReactElement;
  extraFormatSettings?: ReactElement;
  extraButtons?: ReactElement;
  zipFileTypeName: string;
}

// Render one preview page per exported label and reuse that DOM for PNG/AML generation
// so the preview stays the source of truth for both single-file and ZIP exports.
const ExportDialog = ({
  items,
  printSettings,
  setPrintSettings,
  style,
  extraSettings,
  extraSettingsStart,
  extraFormatSettings,
  extraButtons,
  zipFileTypeName,
}: ExportDialogProps) => {
  const t = useTranslate();
  const { mode } = useContext(ColorModeContext);

  const [collapseState, setCollapseState] = useSavedState<string[]>("export-collapseState", []);
  const [previewScale, setPreviewScale] = useSavedState("export-previewScale", 0.7);

  const margin = printSettings?.margin || { top: 0, bottom: 0, left: 0, right: 0 };
  const printerMargin = printSettings?.printerMargin || { top: 0, bottom: 0, left: 0, right: 0 };
  const customPaperSize = printSettings?.customPaperSize || { width: 40, height: 30 };
  const exportDpi = printSettings?.exportDpi || 300;
  const exportFormat = printSettings?.exportFormat || "aml";
  const exportAsZip = printSettings?.exportAsZip ?? false;
  const zipPreviewName = `${exportFormat.toUpperCase()} ${zipFileTypeName} labels.zip`;
  const previewMetaColor = mode === "dark" ? "#bfbfbf" : "#333";

  const paperWidth = customPaperSize.width;
  const paperHeight = customPaperSize.height;
  const itemWidth = Math.max(paperWidth - margin.left - margin.right, 0);
  const itemHeight = Math.max(paperHeight - margin.top - margin.bottom, 0);

  const contentRef = useRef<HTMLDivElement>(null);
  const pngSignature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

  const readUint32BE = (bytes: Uint8Array, offset: number) => {
    return (
      ((bytes[offset] << 24) >>> 0) |
      ((bytes[offset + 1] << 16) >>> 0) |
      ((bytes[offset + 2] << 8) >>> 0) |
      (bytes[offset + 3] >>> 0)
    );
  };

  const writeUint32BE = (target: Uint8Array, offset: number, value: number) => {
    target[offset] = (value >>> 24) & 0xff;
    target[offset + 1] = (value >>> 16) & 0xff;
    target[offset + 2] = (value >>> 8) & 0xff;
    target[offset + 3] = value & 0xff;
  };

  const isPng = (bytes: Uint8Array) => {
    if (bytes.length < pngSignature.length) {
      return false;
    }
    for (let i = 0; i < pngSignature.length; i += 1) {
      if (bytes[i] !== pngSignature[i]) {
        return false;
      }
    }
    return true;
  };

  const getChunkType = (bytes: Uint8Array, offset: number) => {
    return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
  };

  const getCrc32Table = (() => {
    let table: Uint32Array | null = null;
    return () => {
      if (table !== null) {
        return table;
      }
      // Cache the CRC table because every rewritten PNG chunk needs the same lookup.
      table = new Uint32Array(256);
      for (let n = 0; n < 256; n += 1) {
        let c = n;
        for (let k = 0; k < 8; k += 1) {
          c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        table[n] = c >>> 0;
      }
      return table;
    };
  })();

  const crc32 = (bytes: Uint8Array) => {
    const table = getCrc32Table();
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) {
      crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  };

  const createPngChunk = (chunkType: string, data: Uint8Array) => {
    const typeBytes = new Uint8Array([
      chunkType.charCodeAt(0),
      chunkType.charCodeAt(1),
      chunkType.charCodeAt(2),
      chunkType.charCodeAt(3),
    ]);
    const crcInput = new Uint8Array(typeBytes.length + data.length);
    crcInput.set(typeBytes, 0);
    crcInput.set(data, typeBytes.length);

    const chunk = new Uint8Array(12 + data.length);
    writeUint32BE(chunk, 0, data.length);
    chunk.set(typeBytes, 4);
    chunk.set(data, 8);
    writeUint32BE(chunk, 8 + data.length, crc32(crcInput));
    return chunk;
  };

  const setPngDpiMetadata = async (pngBlob: Blob, dpi: number) => {
    const bytes = new Uint8Array(await pngBlob.arrayBuffer());
    if (!isPng(bytes)) {
      return pngBlob;
    }

    // html-to-image gives us correct pixel dimensions, but many image viewers still report
    // 72 DPI unless we write an explicit pHYs chunk into the final PNG bytes.
    const pixelsPerMeter = Math.max(1, Math.round(dpi / 0.0254));
    const physData = new Uint8Array(9);
    writeUint32BE(physData, 0, pixelsPerMeter);
    writeUint32BE(physData, 4, pixelsPerMeter);
    physData[8] = 1;
    const physChunk = createPngChunk("pHYs", physData);

    const chunks: Uint8Array[] = [bytes.slice(0, 8)];
    let offset = 8;
    let insertedPhys = false;
    let removedExistingPhys = false;

    while (offset + 8 <= bytes.length) {
      const chunkLength = readUint32BE(bytes, offset);
      const chunkTotalSize = 12 + chunkLength;
      if (offset + chunkTotalSize > bytes.length) {
        return pngBlob;
      }

      const chunkType = getChunkType(bytes, offset + 4);
      const fullChunk = bytes.slice(offset, offset + chunkTotalSize);

      if (chunkType === "pHYs") {
        removedExistingPhys = true;
        offset += chunkTotalSize;
        continue;
      }

      if (!insertedPhys && chunkType === "IHDR") {
        chunks.push(fullChunk);
        chunks.push(physChunk);
        insertedPhys = true;
      } else if (!insertedPhys && chunkType === "IDAT") {
        chunks.push(physChunk);
        chunks.push(fullChunk);
        insertedPhys = true;
      } else if (!insertedPhys && chunkType === "IEND") {
        chunks.push(physChunk);
        chunks.push(fullChunk);
        insertedPhys = true;
      } else {
        chunks.push(fullChunk);
      }

      offset += chunkTotalSize;
    }

    if (!insertedPhys && !removedExistingPhys) {
      return pngBlob;
    }

    const blobParts: BlobPart[] = chunks.map((chunk) => chunk as unknown as BlobPart);
    return new Blob(blobParts, { type: "image/png" });
  };

  const sanitizeFilename = (value: string) => {
    const trimmed = value.trim();
    if (trimmed === "") {
      return "";
    }
    return (
      trimmed
        // eslint-disable-next-line no-control-regex
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
        .replace(/\s+/g, " ")
        .replace(/\.+$/g, "")
    );
  };

  // Exports deliberately stay one-label-per-page so preview names, AML payloads,
  // and downloaded files all map 1:1 to a logical label.
  const pageBlocks: ReactElement[][] = [];
  for (const item of items) {
    pageBlocks.push([item]);
  }

  const pages = pageBlocks.map(function (pageItems, pageIdx) {
    const pagePreviewSource = pageItems[0];
    const pageRawPreviewName =
      (pagePreviewSource?.props as { "data-aml-name"?: string } | undefined)?.["data-aml-name"] ??
      `label-${pageIdx + 1}`;
    const pagePreviewName = sanitizeFilename(pageRawPreviewName) || `label-${pageIdx + 1}`;

    const itemDivs = pageItems.map((item, itemIdx) => {
      return (
        <div
          key={itemIdx}
          className="print-page-item"
          style={{
            position: "relative",
            width: `${itemWidth}mm`,
            height: `${itemHeight}mm`,
            paddingLeft: `${Math.max(printerMargin.left - margin.left, 0)}mm`,
            paddingRight: `${Math.max(printerMargin.right - margin.right, 0)}mm`,
            paddingTop: `${Math.max(printerMargin.top - margin.top, 0)}mm`,
            paddingBottom: `${Math.max(printerMargin.bottom - margin.bottom, 0)}mm`,
          }}
        >
          {item}
        </div>
      );
    });

    return (
      <div className="print-preview-page" key={pageIdx}>
        <div
          className="print-page"
          style={{
            width: `${paperWidth}mm`,
            height: `${paperHeight}mm`,
            backgroundColor: "#FFF",
            overflow: "hidden",
          }}
        >
          <div
            className="print-page-area"
            style={{
              height: `${paperHeight - margin.top - margin.bottom}mm`,
              width: `${paperWidth - margin.left - margin.right}mm`,
              marginTop: `${margin.top}mm`,
              marginLeft: `${margin.left}mm`,
              marginRight: `${margin.right}mm`,
              marginBottom: `${margin.bottom}mm`,
            }}
          >
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
              }}
            >
              {itemDivs}
            </div>
          </div>
        </div>
        {/* Keep preview filenames outside the white label canvas so they stay readable in the
            UI without becoming part of the exported PNG/AML image content. */}
        <div className="print-preview-filename">
          {pagePreviewName}.{exportFormat}
        </div>
      </div>
    );
  });

  const getPrintItems = () => {
    const root = contentRef.current ?? document;
    return Array.from(root.getElementsByClassName("print-qrcode-item"));
  };

  const downloadTextFile = (filename: string, content: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const downloadBlobFile = (filename: string, blob: Blob) => {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const blobToDataUrl = async (blob: Blob) => {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve(String(reader.result ?? ""));
      };
      reader.onerror = () => {
        reject(reader.error ?? new Error("Failed to convert blob to data URL"));
      };
      reader.readAsDataURL(blob);
    });
  };

  const escapeXml = (value: string) => {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  };

  const buildAmlPageXml = (width: number, height: number, base64Png: string) => {
    const id = Math.floor(Math.random() * 2 ** 31);
    const objectId = Math.floor(Math.random() * 2 ** 31);
    return `<WdPage>
              <masksToBoundsType>0</masksToBoundsType>
              <borderDisplay>0</borderDisplay>
              <isAutoHeight>0</isAutoHeight>
              <lineType>0</lineType>
              <borderWidth>1</borderWidth>
              <borderColor>#000000</borderColor>
              <lockMovement>0</lockMovement>
              <contents><Image>
                    <lineType>0</lineType>
                    <content>${base64Png}</content>
                    <height>${height.toFixed(3)}</height>
                    <width>${width.toFixed(3)}</width>
                    <y>0.000</y>
                    <x>0.000</x>
                    <orientation>0.000000</orientation>
                    <lockMovement>0</lockMovement>
                    <borderDisplay>0</borderDisplay>
                    <borderHeight>0.7055555449591742</borderHeight>
                    <borderColor>#000000</borderColor>
                    <id>${id}</id>
                    <objectId>${objectId}</objectId>
                    <imageEffect>0</imageEffect>
                    <antiColor>0</antiColor>
                    <isRatioScale>1</isRatioScale>
                    <imageType>0</imageType>
                    <isMirror>0</isMirror>
                    <isRedBlack>0</isRedBlack>
                </Image></contents>
              <columnCount>0</columnCount>
                            <isRibbonLabel>0</isRibbonLabel>
          </WdPage>`;
  };

  const buildAmlXml = (name: string, widthMm: number, heightMm: number, base64Pages: string[]) => {
    const width = Number.isFinite(widthMm) ? widthMm : 0;
    const height = Number.isFinite(heightMm) ? heightMm : 0;
    const validBoundsWidth = Math.max(width - 2, 0);
    const validBoundsHeight = Math.max(height - 2, 0);
    const widthIn = width / 25.4;
    const heightIn = height / 25.4;

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<LPAPI version="1.6">
      <labelName>${escapeXml(name)}</labelName>
      <paperName>Custom Label</paperName>
      <isPrintHorizontal>0</isPrintHorizontal>
      <labelHeight>${height.toFixed(3)}</labelHeight>
      <labelWidth>${width.toFixed(3)}</labelWidth>
      <validBoundsX>1</validBoundsX>
      <validBoundsY>1</validBoundsY>
      <validBoundsWidth>${validBoundsWidth.toFixed(0)}</validBoundsWidth>
      <validBoundsHeight>${validBoundsHeight.toFixed(0)}</validBoundsHeight>
      <paperType>0</paperType>
      <paperBackground>#ffffff</paperBackground>
      <paperForeground>#000000</paperForeground>
      <DisplaySize_mm>${width.toFixed(2)}mm * ${height.toFixed(2)}mm</DisplaySize_mm>
      <DisplaySize_in>${widthIn.toFixed(3)}inch * ${heightIn.toFixed(3)}inch</DisplaySize_in>
      <isRotate180>0</isRotate180>
      <isBannerMode>0</isBannerMode>
      <isCustomSize>0</isCustomSize>
      <leftBlank>0</leftBlank>
      <rightBlank>0</rightBlank>
      <upBlank>0</upBlank>
      <downBlank>0</downBlank>
      <typeName>Custom</typeName>
      <showDisplayMm>${width.toFixed(1)} * ${height.toFixed(1)} mm</showDisplayMm>
      <showDisplayIn>${widthIn.toFixed(2)} * ${heightIn.toFixed(2)} in</showDisplayIn>
      <contents>
          ${base64Pages.map((base64Png) => buildAmlPageXml(width, height, base64Png)).join("\n")}
    </contents>
  </LPAPI>
`;
  };

  const getExportImageOptions = () => {
    const exportPixelRatio = Math.max(1, Math.min(exportDpi / 96, 10));
    return {
      backgroundColor: "#FFF",
      cacheBust: true,
      pixelRatio: exportPixelRatio,
    };
  };

  const getUniqueExportItems = () => {
    const hasPrinted: Element[] = [];
    const itemsToPrint = getPrintItems();
    const usedNames = new Set<string>();
    const uniqueItems: { item: Element; safeName: string }[] = [];
    let idx = 1;

    for (const item of itemsToPrint) {
      // Prevent printing copies
      let isDuplicate = false;
      for (let i = 0; i < hasPrinted.length; i += 1) {
        if (item.isEqualNode(hasPrinted[i])) {
          isDuplicate = true;
          break;
        }
      }
      if (isDuplicate) {
        continue;
      }
      hasPrinted.push(item);

      // Export one file per logical label. Duplicate DOM nodes exist only because the print
      // preview can render copies on the sheet, but file exports should not clone names/files.
      const rawName = (item as HTMLElement).dataset.amlName || `label-${idx}`;
      const baseName = sanitizeFilename(rawName) || `label-${idx}`;
      let safeName = baseName;
      let nameSuffix = 1;
      while (usedNames.has(safeName)) {
        safeName = `${baseName}${String(nameSuffix).padStart(2, "0")}`;
        nameSuffix += 1;
      }
      usedNames.add(safeName);
      uniqueItems.push({ item, safeName });
      idx += 1;
    }
    return uniqueItems;
  };

  const saveAsImage = async () => {
    const uniqueItems = getUniqueExportItems();
    for (const { item, safeName } of uniqueItems) {
      const url = await htmlToImage.toPng(item as HTMLElement, getExportImageOptions());
      const response = await fetch(url);
      const blob = await response.blob();
      const pngBlob = await setPngDpiMetadata(blob, exportDpi);
      downloadBlobFile(`${safeName}.png`, pngBlob);
    }
  };

  const saveAsAmlLabels = async () => {
    const uniqueItems = getUniqueExportItems();
    for (const { item, safeName } of uniqueItems) {
      const url = await htmlToImage.toPng(item as HTMLElement, getExportImageOptions());
      const response = await fetch(url);
      const blob = await response.blob();
      const pngBlob = await setPngDpiMetadata(blob, exportDpi);
      const dataUrl = await blobToDataUrl(pngBlob);
      const base64 = dataUrl.split(",")[1] ?? "";
      const aml = buildAmlXml(safeName, paperWidth, paperHeight, [base64]);
      downloadTextFile(`${safeName}.aml`, aml, "application/xml");
    }
  };

  const saveAsZip = async () => {
    const uniqueItems = getUniqueExportItems();
    if (uniqueItems.length === 0) {
      return;
    }

    // ZIP exports reuse the same per-label rendering path so single-file and batch
    // downloads stay consistent apart from the outer archive wrapper.
    const zip = new JSZip();
    for (const { item, safeName } of uniqueItems) {
      const url = await htmlToImage.toPng(item as HTMLElement, getExportImageOptions());
      if (exportFormat === "png") {
        const response = await fetch(url);
        const blob = await response.blob();
        const pngBlob = await setPngDpiMetadata(blob, exportDpi);
        zip.file(`${safeName}.png`, pngBlob);
      } else {
        const response = await fetch(url);
        const blob = await response.blob();
        const pngBlob = await setPngDpiMetadata(blob, exportDpi);
        const dataUrl = await blobToDataUrl(pngBlob);
        const base64 = dataUrl.split(",")[1] ?? "";
        const aml = buildAmlXml(safeName, paperWidth, paperHeight, [base64]);
        zip.file(`${safeName}.aml`, aml);
      }
    }

    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlobFile(zipPreviewName, blob);
  };

  const handleExport = async () => {
    if (exportAsZip) {
      await saveAsZip();
      return;
    }

    if (exportFormat === "png") {
      await saveAsImage();
      return;
    }

    await saveAsAmlLabels();
  };

  return (
    <>
      <Row gutter={16}>
        <Col
          span={14}
          style={{
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              transform: "translateZ(0)",
              overflow: "auto",
              flexBasis: "0px",
              flexGrow: "1",
            }}
          >
            <div
              className="print-container"
              ref={contentRef}
              style={{
                transform: `scale(${previewScale})`,
                transformOrigin: "top left",
              }}
            >
              <style>
                {`
                .print-page {
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji';
                  line-height: 1.2;
                }

                .print-page * {
                  box-sizing: border-box;
                }

                .print-preview-page {
                  margin-top: 2mm;
                }

                .print-preview-zipname {
                  font-size: 2mm;
                  line-height: 1.2;
                  color: ${previewMetaColor};
                  margin: 0 0 1mm 0.5mm;
                  max-width: calc(100% - 1mm);
                  overflow: hidden;
                  text-overflow: ellipsis;
                  white-space: nowrap;
                }

                .print-preview-page .print-preview-filename {
                  font-size: 2mm;
                  line-height: 1.2;
                  color: ${previewMetaColor};
                  margin: 0.5mm 0 0 0.5mm;
                  max-width: calc(100% - 1mm);
                  overflow: hidden;
                  text-overflow: ellipsis;
                  white-space: nowrap;
                }

                ${style ?? ""}
                `}
              </style>
              {exportAsZip && <div className="print-preview-zipname">{zipPreviewName}</div>}
              {pages}
            </div>
          </div>
        </Col>
        <Col span={10}>
          <div style={{ maxHeight: "calc(100vh - 260px)", overflowY: "auto", paddingRight: 8 }}>
            <Form labelAlign="left" colon={false} labelWrap={true} labelCol={{ span: 8 }} wrapperCol={{ span: 16 }}>
              {extraSettingsStart}
              <Divider />
              <Form.Item label={t("printing.generic.exportFormat")}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <Radio.Group
                    options={[
                      { label: t("printing.generic.exportFormatOptions.png"), value: "png" },
                      { label: t("printing.generic.exportFormatOptions.aml"), value: "aml" },
                    ]}
                    onChange={(e) => {
                      printSettings.exportFormat = e.target.value;
                      setPrintSettings(printSettings);
                    }}
                    value={exportFormat}
                    optionType="button"
                    buttonStyle="solid"
                  />
                  <Checkbox
                    checked={exportAsZip}
                    onChange={(event) => {
                      printSettings.exportAsZip = event.target.checked;
                      setPrintSettings(printSettings);
                    }}
                  >
                    {t("printing.generic.exportAsZip")}
                  </Checkbox>
                </div>
              </Form.Item>
              {extraFormatSettings}
              <Form.Item label={t("printing.generic.exportDpi")} help={t("printing.generic.exportDpiHelp")}>
                <Row>
                  <Col span={12}>
                    <Slider
                      min={72}
                      max={600}
                      step={1}
                      tooltip={{ formatter: (value) => `${value} dpi` }}
                      value={exportDpi}
                      onChange={(value) => {
                        printSettings.exportDpi = value;
                        setPrintSettings(printSettings);
                      }}
                    />
                  </Col>
                  <Col span={12}>
                    <InputNumber
                      min={72}
                      max={1200}
                      step={1}
                      style={{ margin: "0 16px" }}
                      value={exportDpi}
                      addonAfter="dpi"
                      onChange={(value) => {
                        printSettings.exportDpi = value ?? 300;
                        setPrintSettings(printSettings);
                      }}
                    />
                  </Col>
                </Row>
              </Form.Item>
              <Form.Item label={t("printing.generic.previewScale")}>
                <Row>
                  <Col span={12}>
                    <Slider
                      min={0.1}
                      max={3}
                      step={0.01}
                      value={previewScale}
                      onChange={(value) => {
                        setPreviewScale(value);
                      }}
                    />
                  </Col>
                  <Col span={12}>
                    <InputNumber
                      min={0.1}
                      max={3}
                      step={0.01}
                      style={{ margin: "0 16px" }}
                      value={previewScale}
                      onChange={(value) => {
                        setPreviewScale(value ?? 0.1);
                      }}
                    />
                  </Col>
                </Row>
              </Form.Item>
              <Divider />
              <Collapse
                defaultActiveKey={collapseState}
                bordered={false}
                ghost
                onChange={(key) => {
                  if (Array.isArray(key)) {
                    setCollapseState(key);
                  }
                }}
              >
                <Collapse.Panel header={t("printing.generic.contentSettings")} key="1">
                  {extraSettings}
                </Collapse.Panel>
                <Collapse.Panel header={t("printing.generic.layoutSettings")} key="2">
                  <Form.Item label={t("printing.generic.dimensions")}>
                    <Row align="middle">
                      <Col span={11}>
                        <InputNumber
                          value={customPaperSize.width}
                          min={1}
                          addonAfter="mm"
                          onChange={(value) => {
                            customPaperSize.width = value ?? 0;
                            printSettings.customPaperSize = customPaperSize;
                            setPrintSettings(printSettings);
                          }}
                        />
                      </Col>
                      <Col span={2} style={{ textAlign: "center" }}>
                        x
                      </Col>
                      <Col span={11}>
                        <InputNumber
                          value={customPaperSize.height}
                          min={1}
                          addonAfter="mm"
                          onChange={(value) => {
                            customPaperSize.height = value ?? 0;
                            printSettings.customPaperSize = customPaperSize;
                            setPrintSettings(printSettings);
                          }}
                        />
                      </Col>
                    </Row>
                  </Form.Item>
                  <Divider />
                  <p>{t("printing.generic.helpMargin")}</p>
                  <Form.Item label={t("printing.generic.marginLeft")}>
                    <Row>
                      <Col span={12}>
                        <Slider
                          min={-20}
                          max={50}
                          step={0.1}
                          tooltip={{ formatter: (value) => `${value} mm` }}
                          value={margin.left}
                          onChange={(value) => {
                            margin.left = value;
                            printSettings.margin = margin;
                            setPrintSettings(printSettings);
                          }}
                        />
                      </Col>
                      <Col span={12}>
                        <InputNumber
                          step={0.1}
                          style={{ margin: "0 16px" }}
                          value={margin.left}
                          addonAfter="mm"
                          onChange={(value) => {
                            margin.left = value ?? 0;
                            printSettings.margin = margin;
                            setPrintSettings(printSettings);
                          }}
                        />
                      </Col>
                    </Row>
                  </Form.Item>
                  <Form.Item label={t("printing.generic.marginTop")}>
                    <Row>
                      <Col span={12}>
                        <Slider
                          min={-20}
                          max={50}
                          step={0.1}
                          tooltip={{ formatter: (value) => `${value} mm` }}
                          value={margin.top}
                          onChange={(value) => {
                            margin.top = value;
                            printSettings.margin = margin;
                            setPrintSettings(printSettings);
                          }}
                        />
                      </Col>
                      <Col span={12}>
                        <InputNumber
                          step={0.1}
                          style={{ margin: "0 16px" }}
                          value={margin.top}
                          addonAfter="mm"
                          onChange={(value) => {
                            margin.top = value ?? 0;
                            printSettings.margin = margin;
                            setPrintSettings(printSettings);
                          }}
                        />
                      </Col>
                    </Row>
                  </Form.Item>
                  <Form.Item label={t("printing.generic.marginRight")}>
                    <Row>
                      <Col span={12}>
                        <Slider
                          min={-20}
                          max={50}
                          step={0.1}
                          tooltip={{ formatter: (value) => `${value} mm` }}
                          value={margin.right}
                          onChange={(value) => {
                            margin.right = value;
                            printSettings.margin = margin;
                            setPrintSettings(printSettings);
                          }}
                        />
                      </Col>
                      <Col span={12}>
                        <InputNumber
                          step={0.1}
                          style={{ margin: "0 16px" }}
                          value={margin.right}
                          addonAfter="mm"
                          onChange={(value) => {
                            margin.right = value ?? 0;
                            printSettings.margin = margin;
                            setPrintSettings(printSettings);
                          }}
                        />
                      </Col>
                    </Row>
                  </Form.Item>
                  <Form.Item label={t("printing.generic.marginBottom")}>
                    <Row>
                      <Col span={12}>
                        <Slider
                          min={-20}
                          max={50}
                          step={0.1}
                          tooltip={{ formatter: (value) => `${value} mm` }}
                          value={margin.bottom}
                          onChange={(value) => {
                            margin.bottom = value;
                            printSettings.margin = margin;
                            setPrintSettings(printSettings);
                          }}
                        />
                      </Col>
                      <Col span={12}>
                        <InputNumber
                          step={0.1}
                          style={{ margin: "0 16px" }}
                          value={margin.bottom}
                          addonAfter="mm"
                          onChange={(value) => {
                            margin.bottom = value ?? 0;
                            printSettings.margin = margin;
                            setPrintSettings(printSettings);
                          }}
                        />
                      </Col>
                    </Row>
                  </Form.Item>
                  <Divider />
                  <p>{t("printing.generic.helpPrinterMargin")}</p>
                  <Form.Item label={t("printing.generic.printerMarginLeft")}>
                    <Row>
                      <Col span={12}>
                        <Slider
                          min={-20}
                          max={50}
                          step={0.1}
                          tooltip={{ formatter: (value) => `${value} mm` }}
                          value={printerMargin.left}
                          onChange={(value) => {
                            printerMargin.left = value;
                            printSettings.printerMargin = printerMargin;
                            setPrintSettings(printSettings);
                          }}
                        />
                      </Col>
                      <Col span={12}>
                        <InputNumber
                          step={0.1}
                          style={{ margin: "0 16px" }}
                          value={printerMargin.left}
                          addonAfter="mm"
                          onChange={(value) => {
                            printerMargin.left = value ?? 0;
                            printSettings.printerMargin = printerMargin;
                            setPrintSettings(printSettings);
                          }}
                        />
                      </Col>
                    </Row>
                  </Form.Item>
                  <Form.Item label={t("printing.generic.printerMarginTop")}>
                    <Row>
                      <Col span={12}>
                        <Slider
                          min={-20}
                          max={50}
                          step={0.1}
                          tooltip={{ formatter: (value) => `${value} mm` }}
                          value={printerMargin.top}
                          onChange={(value) => {
                            printerMargin.top = value;
                            printSettings.printerMargin = printerMargin;
                            setPrintSettings(printSettings);
                          }}
                        />
                      </Col>
                      <Col span={12}>
                        <InputNumber
                          step={0.1}
                          style={{ margin: "0 16px" }}
                          value={printerMargin.top}
                          addonAfter="mm"
                          onChange={(value) => {
                            printerMargin.top = value ?? 0;
                            printSettings.printerMargin = printerMargin;
                            setPrintSettings(printSettings);
                          }}
                        />
                      </Col>
                    </Row>
                  </Form.Item>
                  <Form.Item label={t("printing.generic.printerMarginRight")}>
                    <Row>
                      <Col span={12}>
                        <Slider
                          min={-20}
                          max={50}
                          step={0.1}
                          tooltip={{ formatter: (value) => `${value} mm` }}
                          value={printerMargin.right}
                          onChange={(value) => {
                            printerMargin.right = value;
                            printSettings.printerMargin = printerMargin;
                            setPrintSettings(printSettings);
                          }}
                        />
                      </Col>
                      <Col span={12}>
                        <InputNumber
                          step={0.1}
                          style={{ margin: "0 16px" }}
                          value={printerMargin.right}
                          addonAfter="mm"
                          onChange={(value) => {
                            printerMargin.right = value ?? 0;
                            printSettings.printerMargin = printerMargin;
                            setPrintSettings(printSettings);
                          }}
                        />
                      </Col>
                    </Row>
                  </Form.Item>
                  <Form.Item label={t("printing.generic.printerMarginBottom")}>
                    <Row>
                      <Col span={12}>
                        <Slider
                          min={-20}
                          max={50}
                          step={0.1}
                          tooltip={{ formatter: (value) => `${value} mm` }}
                          value={printerMargin.bottom}
                          onChange={(value) => {
                            printerMargin.bottom = value;
                            printSettings.printerMargin = printerMargin;
                            setPrintSettings(printSettings);
                          }}
                        />
                      </Col>
                      <Col span={12}>
                        <InputNumber
                          step={0.1}
                          style={{ margin: "0 16px" }}
                          value={printerMargin.bottom}
                          addonAfter="mm"
                          onChange={(value) => {
                            printerMargin.bottom = value ?? 0;
                            printSettings.printerMargin = printerMargin;
                            setPrintSettings(printSettings);
                          }}
                        />
                      </Col>
                    </Row>
                  </Form.Item>
                </Collapse.Panel>
              </Collapse>
            </Form>
          </div>
        </Col>
      </Row>
      <Row justify={"end"} style={{ paddingRight: 72 }}>
        <Col>
          <Space>
            {extraButtons}
            <Button type="primary" icon={<DownloadOutlined />} size="large" onClick={handleExport}>
              {t("printing.generic.exportLabels")}
            </Button>
          </Space>
        </Col>
      </Row>
    </>
  );
};

export default ExportDialog;
