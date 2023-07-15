import React, { useRef } from "react";
import {
  Modal,
  Slider,
  Button,
  Select,
  Row,
  Col,
  QRCode,
  Form,
  Divider,
  Switch,
} from "antd";
import ReactToPrint from "react-to-print";
import { useSavedState } from "../../utils/saveload";

interface QRCodeData {
  id: number;
  content: string;
}

interface QRCodePrintingDialogProps {
  visible: boolean;
  onCancel: () => void;
}

interface PaperDimensions {
  width: number;
  height: number;
}

const paperDimensions: { [key: string]: PaperDimensions } = {
  A3: {
    width: 297,
    height: 420,
  },
  A4: {
    width: 210,
    height: 297,
  },
  A5: {
    width: 148,
    height: 210,
  },
  Letter: {
    width: 216,
    height: 279,
  },
  Legal: {
    width: 216,
    height: 356,
  },
  Tabloid: {
    width: 279,
    height: 432,
  },
};

const QRCodePrintingDialog: React.FC<QRCodePrintingDialogProps> = ({
  visible,
  onCancel,
}) => {
  const [marginLeft, setMarginLeft] = useSavedState("print-marginLeft", 10);
  const [marginTop, setMarginTop] = useSavedState("print-marginTop", 10);
  const [marginRight, setMarginRight] = useSavedState("print-marginRight", 10);
  const [marginBottom, setMarginBottom] = useSavedState(
    "print-marginBottom",
    10
  );
  const [codesPerRow, setCodesPerRow] = useSavedState("print-codesPerRow", 3);
  const [paperSize, setPaperSize] = useSavedState("print-paperSize", "A4");
  const [rowHeight, setRowHeight] = useSavedState("print-rowHeight", 70);
  const [showContent, setShowContent] = useSavedState(
    "print-showContent",
    true
  );
  const [previewScale, setPreviewScale] = useSavedState(
    "print-previewScale",
    0.6
  );
  const [showBorder, setShowBorder] = useSavedState("print-showBorder", true);
  const [textSize, setTextSize] = useSavedState("print-textSize", 7);

  const qrCodeData: QRCodeData[] = Array.from({ length: 10 }).map(
    (_, index) => ({
      id: index,
      content: `QR Code ${index + 1}`,
    })
  );

  const paperWidth = paperDimensions[paperSize].width;
  const paperHeight = paperDimensions[paperSize].height;

  const printRef = useRef<HTMLDivElement>(null);

  const codesPerPage =
    codesPerRow *
    Math.floor((paperHeight - marginTop - marginBottom) / rowHeight);
  const pageBlocks = [];
  for (let i = 0; i < qrCodeData.length; i += 1) {
    if (i % codesPerPage === 0) {
      pageBlocks.push(qrCodeData.slice(i, i + codesPerPage));
    }
  }
  const rowBlocks = pageBlocks.map((pageBlock, idx) => (
    <div
      className="print-page"
      key={idx}
      style={{
        width: `${paperWidth}mm`,
        height: `${paperHeight}mm`,
        paddingTop: `calc(${marginTop}mm - ${showBorder ? "1px" : "0px"})`,
        paddingLeft: `calc(${marginLeft}mm - ${showBorder ? "1px" : "0px"})`,
        paddingRight: `calc(${marginRight}mm - ${showBorder ? "1px" : "0px"})`,
        paddingBottom: `calc(${marginBottom}mm - ${
          showBorder ? "1px" : "0px"
        })`,
        backgroundColor: "#FFF",
      }}
    >
      <Row
        style={{
          border: showBorder ? "1px solid #000" : "none",
          width: "100%",
          height: "100%",
          alignContent: "flex-start",
        }}
      >
        {pageBlock.map((qrCode) => (
          <div
            key={qrCode.id}
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              width: `${
                (paperWidth - marginLeft - marginRight - 1) / codesPerRow
              }mm`,
              height: `${rowHeight}mm`,
              //   flex: `0 0 calc(100% / ${codesPerRow})`,
              flexDirection: "column",
            }}
          >
            <QRCode
              className="print-qrcode"
              value={qrCode.content}
              type="svg"
              color="#000"
            />
            {showContent && (
              <div
                className="print-qrcode-title"
                style={{ textAlign: "center", color: "#000" }}
              >
                {qrCode.content}
              </div>
            )}
          </div>
        ))}
      </Row>
    </div>
  ));

  return (
    <Modal
      open={visible}
      title="QR Code Printing"
      onCancel={onCancel}
      footer={[
        <ReactToPrint
          key="print-button"
          trigger={() => <Button type="primary">Print</Button>}
          content={() => printRef.current}
        />,
      ]}
      width={1000} // Set the modal width to accommodate the preview
    >
      <Row gutter={16}>
        <Col span={16}>
          <div
            style={{
              transform: "translateZ(0)",
              overflow: "hidden scroll",
              height: "70vh",
            }}
          >
            <div
              className="print-container"
              ref={printRef}
              style={{
                transform: `scale(${previewScale})`,
                transformOrigin: "top left",
                display: "block",
              }}
            >
              <style>
                {`
                @media print {
                    @page {
                        /* size: ${paperWidth}mm ${paperHeight}mm */;
                        size: auto;
                        margin: 0;
                    }
                    .print-container {
                        transform: scale(1) !important;
                    }
                    .print-page {
                        page-break-before: auto;
                    }
                }

                @media screen {
                    .print-page {
                        margin-top: 10mm;
                    }
                }

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
              </style>
              {rowBlocks}
            </div>
          </div>
        </Col>
        <Col span={8}>
          <Form
            labelAlign="left"
            colon={false}
            labelCol={{ span: 14 }}
            wrapperCol={{ span: 10 }}
          >
            <Form.Item label="Left Margin (mm)">
              <Slider
                min={0}
                max={50}
                value={marginLeft}
                onChange={(value) => {
                  setMarginLeft(value);
                }}
              />
            </Form.Item>
            <Form.Item label="Up Margin (mm)">
              <Slider
                min={0}
                max={50}
                value={marginTop}
                onChange={(value) => {
                  setMarginTop(value);
                }}
              />
            </Form.Item>
            <Form.Item label="Right Margin (mm)">
              <Slider
                min={0}
                max={50}
                value={marginRight}
                onChange={(value) => {
                  setMarginRight(value);
                }}
              />
            </Form.Item>
            <Form.Item label="Bottom Margin (mm)">
              <Slider
                min={0}
                max={50}
                value={marginBottom}
                onChange={(value) => {
                  setMarginBottom(value);
                }}
              />
            </Form.Item>
            <Form.Item label="Codes per Row">
              <Slider
                min={1}
                max={5}
                value={codesPerRow}
                onChange={(value) => {
                  setCodesPerRow(value);
                }}
              />
            </Form.Item>
            <Form.Item label="Paper Size">
              <Select
                value={paperSize}
                onChange={(value) => setPaperSize(value)}
              >
                {Object.keys(paperDimensions).map((key) => (
                  <Select.Option key={key} value={key}>
                    {key}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item label="Row Height (mm)">
              <Slider
                min={30}
                max={200}
                value={rowHeight}
                onChange={(value) => {
                  setRowHeight(value);
                }}
              />
            </Form.Item>
            <Form.Item label="Text Size (mm)">
              <Slider
                min={3}
                max={15}
                value={textSize}
                step={0.1}
                onChange={(value) => {
                  setTextSize(value);
                }}
              />
            </Form.Item>
            <Form.Item label="Show QR Code Content">
              <Switch
                checked={showContent}
                onChange={(checked) => setShowContent(checked)}
              />
            </Form.Item>
            <Form.Item label="Show Border">
              <Switch
                checked={showBorder}
                onChange={(checked) => setShowBorder(checked)}
              />
            </Form.Item>
            <Divider />
            <Form.Item label="Preview Scale">
              <Slider
                min={0.1}
                max={1}
                step={0.01}
                value={previewScale}
                onChange={(value) => {
                  setPreviewScale(value);
                }}
              />
            </Form.Item>
          </Form>
        </Col>
      </Row>
    </Modal>
  );
};

export default QRCodePrintingDialog;
