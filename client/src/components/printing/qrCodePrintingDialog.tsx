import { Form, QRCode, Slider, Switch } from "antd";
import { useSavedState } from "../../utils/saveload";
import PrintingDialog from "./printingDialog";

interface QRCodeData {
  value: string;
  label?: string;
  errorLevel?: "L" | "M" | "Q" | "H";
}

interface QRCodePrintingDialogProps {
  visible: boolean;
  items: QRCodeData[];
  onCancel: () => void;
}

const QRCodePrintingDialog: React.FC<QRCodePrintingDialogProps> = ({
  visible,
  items,
  onCancel,
}) => {
  const [showContent, setShowContent] = useSavedState(
    "print-showContent",
    true
  );
  const [textSize, setTextSize] = useSavedState("print-textSize", 5);
  const [showSpoolmanIcon, setShowSpoolmanIcon] = useSavedState(
    "print-showSpoolmanIcon",
    true
  );

  const elements = items.map((item) => {
    return (
      <>
        <QRCode
          className="print-qrcode"
          icon={showSpoolmanIcon ? "/favicon.ico" : undefined}
          value={item.value}
          errorLevel={item.errorLevel}
          type="svg"
          color="#000"
        />
        {showContent && (
          <div
            className="print-qrcode-title"
            style={{ textAlign: "center", color: "#000" }}
          >
            {item.label ?? item.value}
          </div>
        )}
      </>
    );
  });

  return (
    <PrintingDialog
      visible={visible}
      title="QR Code Printing"
      items={elements}
      extraSettings={
        <>
          <Form.Item label="Show QR Code Content">
            <Switch
              checked={showContent}
              onChange={(checked) => setShowContent(checked)}
            />
          </Form.Item>
          <Form.Item label="Content Text Size">
            <Slider
              disabled={!showContent}
              tooltip={{ formatter: (value) => `${value} mm` }}
              min={3}
              max={15}
              value={textSize}
              step={0.1}
              onChange={(value) => {
                setTextSize(value);
              }}
            />
          </Form.Item>
          <Form.Item label="Show Spoolman Icon">
            <Switch
              checked={showSpoolmanIcon}
              onChange={(checked) => setShowSpoolmanIcon(checked)}
            />
          </Form.Item>
        </>
      }
      style={`
            .print-page .print-qrcode {
                height: 100% !important;
                width: 100% !important;
            }

            .print-page .print-qrcode-title {
                font-size: ${textSize}mm;
            }

            .print-page svg {
                display: block;
                height: 100%;
                width: auto;
            }
            `}
      onCancel={onCancel}
    />
  );
};

export default QRCodePrintingDialog;
