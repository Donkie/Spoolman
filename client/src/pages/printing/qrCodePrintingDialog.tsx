import { useTranslate } from "@refinedev/core";
import { Col, Form, InputNumber, QRCode, Radio, RadioChangeEvent, Row, Slider, Switch, Typography } from "antd";
import { ReactElement } from "react";
import { getBasePath } from "../../utils/url";
import { QRCodePrintSettings } from "./printing";
import PrintingDialog from "./printingDialog";

const { Text } = Typography;

interface QRCodeData {
  value: string;
  label?: ReactElement;
  errorLevel?: "L" | "M" | "Q" | "H";
}

interface QRCodePrintingDialogProps {
  items: QRCodeData[];
  printSettings: QRCodePrintSettings;
  setPrintSettings: (setPrintSettings: QRCodePrintSettings) => void;
  extraSettings?: ReactElement;
  extraSettingsStart?: ReactElement;
  extraButtons?: ReactElement;
  baseUrlRoot: string;
  useHTTPUrl: boolean;
  setUseHTTPUrl: (value: boolean) => void;
}

const QRCodePrintingDialog: React.FC<QRCodePrintingDialogProps> = ({
  items,
  printSettings,
  setPrintSettings,
  extraSettings,
  extraSettingsStart,
  extraButtons,
  baseUrlRoot,
  useHTTPUrl,
  setUseHTTPUrl,
}) => {
  const t = useTranslate();

  const showContent = printSettings?.showContent === undefined ? true : printSettings?.showContent;
  const showQRCodeMode = printSettings?.showQRCodeMode || "withIcon";
  const textSize = printSettings?.textSize || 3;

  const elements = items.map((item) => {
    return (
      <div className="print-qrcode-item">
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
        {showContent && (
          <div className="print-qrcode-title" style={showQRCodeMode === "no" ? { paddingLeft: "1mm" } : {}}>
            {item.label ?? item.value}
          </div>
        )}
      </div>
    );
  });

  return (
    <PrintingDialog
      items={elements}
      printSettings={printSettings.printSettings}
      setPrintSettings={(newSettings) => {
        printSettings.printSettings = newSettings;
        setPrintSettings(printSettings);
      }}
      extraButtons={extraButtons}
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
                printSettings.showQRCodeMode = e.target.value;
                setPrintSettings(printSettings);
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
                <Text> {useHTTPUrl ? `${baseUrlRoot}/spool/show/{id}` : `web+spoolman:s-{id}`}</Text>
              </Form.Item>
            </>
          )}
          <Form.Item label={t("printing.qrcode.showContent")}>
            <Switch
              checked={showContent}
              onChange={(checked) => {
                printSettings.showContent = checked;
                setPrintSettings(printSettings);
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
                    printSettings.textSize = value;
                    setPrintSettings(printSettings);
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
                    printSettings.textSize = value ?? 5;
                    setPrintSettings(printSettings);
                  }}
                />
              </Col>
            </Row>
          </Form.Item>

          {extraSettings}
        </>
      }
      style={`
            .print-page .print-qrcode-item {
              display: flex;
              width: 100%;
              height: 100%;
              justify-content: center;
            }

            .print-page .print-qrcode-container {
              max-width: ${showContent ? "50%" : "100%"};
              display: flex;
            }

            .print-page .print-qrcode {
              width: auto !important;
              height: auto !important;
              padding: 2mm;
            }

            .print-page .print-qrcode-title {
              flex: 1 1 auto;
              font-size: ${textSize}mm;
              color: #000;
              overflow: hidden;
            }

            .print-page canvas, .print-page svg {
              /* display: block; */
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

export default QRCodePrintingDialog;
