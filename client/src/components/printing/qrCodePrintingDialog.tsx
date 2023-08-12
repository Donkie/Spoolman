import { Col, Form, InputNumber, QRCode, Row, Slider, Switch } from "antd";
import { useSavedState } from "../../utils/saveload";
import PrintingDialog from "./printingDialog";
import { useTranslate } from "@refinedev/core";

interface QRCodeData {
  value: string;
  label?: JSX.Element;
  errorLevel?: "L" | "M" | "Q" | "H";
}

interface QRCodePrintingDialogProps {
  visible: boolean;
  items: QRCodeData[];
  onCancel: () => void;
  extraSettings?: JSX.Element;
}

const QRCodePrintingDialog: React.FC<QRCodePrintingDialogProps> = ({ visible, items, onCancel, extraSettings }) => {
  const t = useTranslate();

  const [showContent, setShowContent] = useSavedState("print-showContent", true);
  const [textSize, setTextSize] = useSavedState("print-textSize", 3);
  const [showSpoolmanIcon, setShowSpoolmanIcon] = useSavedState("print-showSpoolmanIcon", true);

  const elements = items.map((item) => {
    return (
      <div className="print-qrcode-item">
        <div className="print-qrcode-container">
          <QRCode
            className="print-qrcode"
            icon={showSpoolmanIcon ? "/favicon.svg" : undefined}
            value={item.value}
            errorLevel={item.errorLevel}
            type="svg"
            color="#000"
          />
        </div>
        {showContent && <div className="print-qrcode-title">{item.label ?? item.value}</div>}
      </div>
    );
  });

  return (
    <PrintingDialog
      visible={visible}
      title={t("printing.qrcode.title")}
      items={elements}
      extraSettings={
        <>
          <Form.Item label={t("printing.qrcode.showContent")}>
            <Switch checked={showContent} onChange={(checked) => setShowContent(checked)} />
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
                    setTextSize(value);
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
                    setTextSize(value ?? 5);
                  }}
                />
              </Col>
            </Row>
          </Form.Item>
          <Form.Item label={t("printing.qrcode.showSpoolmanIcon")}>
            <Switch checked={showSpoolmanIcon} onChange={(checked) => setShowSpoolmanIcon(checked)} />
          </Form.Item>
          {extraSettings}
        </>
      }
      style={`
            .print-page .print-qrcode-item {
              display: flex;
              width: 100%;
              max-height: 100%;
              justify-content: center;
            }

            .print-page .print-qrcode-container {
              max-width: ${showContent ? "50%" : "100%"};
              display: flex;
            }

            .print-page .print-qrcode {
              width: auto !important;
              height: auto !important;
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
      onCancel={onCancel}
    />
  );
};

export default QRCodePrintingDialog;
