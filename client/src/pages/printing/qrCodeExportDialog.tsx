import { useTranslate } from "@refinedev/core";
import { Col, Form, InputNumber, QRCode, Radio, RadioChangeEvent, Row, Slider, Switch, Typography } from "antd";
import { ReactElement } from "react";
import VendorLogo from "../../components/vendorLogo";
import { getBasePath } from "../../utils/url";
import { IVendor } from "../vendors/model";
import { QRCodePrintSettings } from "./printing";
import ExportDialog from "./exportDialog";
import TitleTextBlock from "./titleTextBlock";

const { Text } = Typography;

interface QRCodeData {
  value: string;
  title?: ReactElement;
  label?: ReactElement;
  vendor?: IVendor;
  errorLevel?: "L" | "M" | "Q" | "H";
  amlName?: string;
}

interface QRCodeExportDialogProps {
  items: QRCodeData[];
  printSettings: QRCodePrintSettings;
  setPrintSettings: (setPrintSettings: QRCodePrintSettings) => void;
  extraSettings?: ReactElement;
  extraTitleSettings?: ReactElement;
  extraInfoSettings?: ReactElement;
  extraSettingsStart?: ReactElement;
  extraFormatSettings?: ReactElement;
  extraButtons?: ReactElement;
  baseUrlRoot: string;
  useHTTPUrl: boolean;
  setUseHTTPUrl: (value: boolean) => void;
  previewValues?: { default: string; url: string };
  zipFileTypeName: string;
}

// Wrap the generic export layout with QR-specific controls so spool and filament
// export flows can share one renderer without forking the export pipeline.
const QRCodeExportDialog = ({
  items,
  printSettings,
  setPrintSettings,
  extraSettings,
  extraTitleSettings,
  extraInfoSettings,
  extraSettingsStart,
  extraFormatSettings,
  extraButtons,
  baseUrlRoot,
  useHTTPUrl,
  setUseHTTPUrl,
  previewValues,
  zipFileTypeName,
}: QRCodeExportDialogProps) => {
  const t = useTranslate();

  const showContent = printSettings?.showContent === undefined ? true : printSettings?.showContent;
  const showQRCodeMode = printSettings?.showQRCodeMode || "withIcon";
  const textSize = printSettings?.textSize || 3;
  const showManufacturerLogo = printSettings?.showManufacturerLogo ?? true;
  const logoSource = printSettings?.logoSource || "print";
  const logoHeightMm = printSettings?.logoHeightMm || 6;
  const showTitle = printSettings?.showTitle ?? true;
  const titleMaxTextSize = printSettings?.titleMaxTextSize || 4.5;
  const titleFitToWidth = printSettings?.titleFitToWidth ?? true;
  const titleAlign = printSettings?.titleAlign || "left";
  const qrCodeSizeMm = printSettings?.qrCodeSizeMm || 18;
  const qrCodePosition = printSettings?.qrCodePosition || "left";
  const qrCodeAlign = printSettings?.qrCodeAlign || "center";
  const infoAlign = printSettings?.infoAlign || "left";
  const infoVerticalAlign = printSettings?.infoVerticalAlign || "top";
  const preview = previewValues ?? ({ default: `WEB+SPOOLMAN:S-{id}`, url: `${baseUrlRoot}/spool/show/{id}` } as const);

  const horizontalFlexAlign = (value: "left" | "center" | "right") => {
    if (value === "center") return "center";
    if (value === "right") return "flex-end";
    return "flex-start";
  };

  const verticalFlexAlign = (value: "top" | "center" | "bottom") => {
    if (value === "center") return "center";
    if (value === "bottom") return "flex-end";
    return "flex-start";
  };

  // ExportDialog captures each `.print-qrcode-item` into its own file, so attach the
  // rendered label body and export filename metadata at this level.
  const elements = items.map((item, idx) => {
    return (
      <div className="print-qrcode-item" key={idx} data-aml-name={item.amlName ?? ""}>
        {showQRCodeMode !== "no" && (
          <div className="print-qrcode-container">
            <QRCode
              className="print-qrcode"
              icon={showQRCodeMode === "withIcon" ? getBasePath() + "/favicon.svg" : undefined}
              value={item.value}
              errorLevel={item.errorLevel}
              type="svg"
              color="#000"
            />
          </div>
        )}
        {(showManufacturerLogo || showTitle || showContent) && (
          <div className="print-qrcode-content" style={showQRCodeMode === "no" ? { paddingLeft: "1mm" } : {}}>
            {showManufacturerLogo && item.vendor && (
              <div
                className="print-qrcode-logo"
                style={{
                  minHeight: `${logoHeightMm}mm`,
                  maxHeight: `${logoHeightMm}mm`,
                  justifyContent: horizontalFlexAlign(titleAlign),
                }}
              >
                <VendorLogo
                  vendor={item.vendor}
                  usePrintLogo={logoSource === "print"}
                  showFallbackText
                  imgStyle={{
                    display: "block",
                    maxWidth: "100%",
                    maxHeight: "100%",
                    objectFit: "contain",
                    objectPosition: `${titleAlign} center`,
                  }}
                  fallbackStyle={{
                    color: "#000",
                    fontWeight: 700,
                    fontSize: "3mm",
                    lineHeight: 1.1,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    width: "100%",
                    textAlign: titleAlign,
                  }}
                />
              </div>
            )}
            {showTitle && item.title && (
              <div className="print-qrcode-title-block">
                <TitleTextBlock fitToWidth={titleFitToWidth} align={titleAlign} maxTextSizeMm={titleMaxTextSize}>
                  {item.title}
                </TitleTextBlock>
              </div>
            )}
            {showContent && (
              <div
                className="print-qrcode-info"
                style={{
                  textAlign: infoAlign,
                  justifyContent: verticalFlexAlign(infoVerticalAlign),
                  alignItems: horizontalFlexAlign(infoAlign),
                }}
              >
                {item.label ?? item.value}
              </div>
            )}
          </div>
        )}
      </div>
    );
  });

  return (
    <ExportDialog
      items={elements}
      printSettings={printSettings.printSettings}
      setPrintSettings={(newSettings) => {
        // Spread to preserve immutability — printSettings.printSettings is a nested object
        setPrintSettings({ ...printSettings, printSettings: newSettings });
      }}
      extraButtons={extraButtons}
      extraFormatSettings={extraFormatSettings}
      zipFileTypeName={zipFileTypeName}
      extraSettingsStart={extraSettingsStart}
      extraSettings={
        <>
          <Form.Item label={t("printing.qrcode.showQRCode")}>
            <Radio.Group
              options={[
                { label: t("printing.qrcode.showQRCodeMode.no"), value: "no" },
                {
                  label: t("printing.qrcode.showQRCodeMode.simple"),
                  value: "simple",
                },
                { label: t("printing.qrcode.showQRCodeMode.withIcon"), value: "withIcon" },
              ]}
              onChange={(e: RadioChangeEvent) => {
                setPrintSettings({ ...printSettings, showQRCodeMode: e.target.value });
              }}
              value={showQRCodeMode}
              optionType="button"
              buttonStyle="solid"
            />
          </Form.Item>
          {showQRCodeMode !== "no" && (
            <>
              <Form.Item
                label={t("printing.qrcode.useHTTPUrl.label")}
                tooltip={t("printing.qrcode.useHTTPUrl.tooltip")}
                style={{ marginBottom: 0 }}
              >
                <Radio.Group onChange={(e) => setUseHTTPUrl(e.target.value)} value={useHTTPUrl}>
                  <Radio value={false}>{t("printing.qrcode.useHTTPUrl.options.default")}</Radio>
                  <Radio value={true}>{t("printing.qrcode.useHTTPUrl.options.url")}</Radio>
                </Radio.Group>
              </Form.Item>
              <Form.Item label={t("printing.qrcode.useHTTPUrl.preview")}>
                <Text> {useHTTPUrl ? preview.url : preview.default}</Text>
              </Form.Item>
            </>
          )}
          <Form.Item label={t("printing.qrcode.showContent")}>
            <Switch
              checked={showContent}
              onChange={(checked) => {
                setPrintSettings({ ...printSettings, showContent: checked });
              }}
            />
          </Form.Item>
          <Form.Item label={t("printing.qrcode.showManufacturerLogo")}>
            <Switch
              checked={showManufacturerLogo}
              onChange={(checked) => {
                setPrintSettings({ ...printSettings, showManufacturerLogo: checked });
              }}
            />
          </Form.Item>
          {showManufacturerLogo && (
            <>
              <Form.Item label={t("printing.qrcode.logoSource")}>
                <Radio.Group
                  options={[
                    { label: t("printing.qrcode.logoSourceOptions.print"), value: "print" },
                    { label: t("printing.qrcode.logoSourceOptions.color"), value: "color" },
                  ]}
                  onChange={(e: RadioChangeEvent) => {
                    setPrintSettings({ ...printSettings, logoSource: e.target.value });
                  }}
                  value={logoSource}
                  optionType="button"
                  buttonStyle="solid"
                />
              </Form.Item>
              <Form.Item label={t("printing.qrcode.logoSize")}>
                <Row>
                  <Col span={12}>
                    <Slider
                      min={3}
                      max={14}
                      value={logoHeightMm}
                      step={0.1}
                      tooltip={{ formatter: (value) => `${value} mm` }}
                      onChange={(value) => {
                        setPrintSettings({ ...printSettings, logoHeightMm: value });
                      }}
                    />
                  </Col>
                  <Col span={12}>
                    <InputNumber
                      min={0.1}
                      step={0.1}
                      style={{ margin: "0 16px" }}
                      value={logoHeightMm}
                      addonAfter="mm"
                      onChange={(value) => {
                        setPrintSettings({ ...printSettings, logoHeightMm: value ?? 6 });
                      }}
                    />
                  </Col>
                </Row>
              </Form.Item>
            </>
          )}
          <Form.Item label={t("printing.qrcode.showTitle")}>
            <Switch
              checked={showTitle}
              onChange={(checked) => {
                setPrintSettings({ ...printSettings, showTitle: checked });
              }}
            />
          </Form.Item>
          <Form.Item label={t("printing.qrcode.textSize")}>
            <Row>
              <Col span={12}>
                <Slider
                  disabled={!showContent}
                  tooltip={{ formatter: (value) => `${value} mm` }}
                  min={2}
                  max={7}
                  value={textSize}
                  step={0.1}
                  onChange={(value) => {
                    setPrintSettings({ ...printSettings, textSize: value });
                  }}
                />
              </Col>
              <Col span={12}>
                <InputNumber
                  disabled={!showContent}
                  min={0.01}
                  step={0.1}
                  style={{ margin: "0 16px" }}
                  value={textSize}
                  addonAfter="mm"
                  onChange={(value) => {
                    setPrintSettings({ ...printSettings, textSize: value ?? 5 });
                  }}
                />
              </Col>
            </Row>
          </Form.Item>

          {extraTitleSettings}
          {extraInfoSettings}
          {extraSettings}
        </>
      }
      style={`
            .print-page .print-qrcode-item {
              display: flex;
              width: 100%;
              height: 100%;
              flex-direction: ${qrCodePosition === "right" ? "row-reverse" : "row"};
              align-items: ${verticalFlexAlign(qrCodeAlign)};
              gap: 1mm;
            }

            .print-page .print-qrcode-container {
              display: flex;
              flex: 0 0 auto;
              width: ${qrCodeSizeMm}mm;
              min-width: ${qrCodeSizeMm}mm;
              max-width: ${qrCodeSizeMm}mm;
              align-self: ${verticalFlexAlign(qrCodeAlign)};
            }

            .print-page .print-qrcode {
              width: 100% !important;
              height: ${qrCodeSizeMm}mm !important;
              padding: 1mm;
            }

            .print-page .print-qrcode-content {
              flex: 1 1 auto;
              min-width: 0;
              height: 100%;
              overflow: hidden;
              display: flex;
              flex-direction: column;
              gap: 0.6mm;
            }

            .print-page .print-qrcode-logo {
              display: flex;
              align-items: center;
              overflow: hidden;
            }

            .print-page .print-qrcode-title-block {
              flex: 0 0 auto;
              overflow: hidden;
            }

            .print-page .print-qrcode-info {
              flex: 1 1 auto;
              font-size: ${textSize}mm;
              color: #000;
              overflow: hidden;
              display: flex;
            }

            .print-page canvas, .print-page svg {
              object-fit: contain;
              height: 100% !important;
              width: 100% !important;
              max-height: 100%;
              max-width: 100%;
            }
            `}
    />
  );
};

export default QRCodeExportDialog;
