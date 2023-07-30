import React, { useRef } from "react";
import {
  Modal,
  Slider,
  Button,
  Select,
  Row,
  Col,
  Form,
  Divider,
  Switch,
} from "antd";
import ReactToPrint from "react-to-print";
import { useSavedState } from "../../utils/saveload";

interface PrintingDialogProps {
  items: JSX.Element[];
  style?: string;
  extraSettings?: JSX.Element;
  visible: boolean;
  onCancel: () => void;
  title?: string;
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

const PrintingDialog: React.FC<PrintingDialogProps> = ({
  items,
  style,
  extraSettings,
  visible,
  onCancel,
  title,
}) => {
  const [marginLeft, setMarginLeft] = useSavedState("print-marginLeft", 10);
  const [marginTop, setMarginTop] = useSavedState("print-marginTop", 10);
  const [marginRight, setMarginRight] = useSavedState("print-marginRight", 10);
  const [marginBottom, setMarginBottom] = useSavedState(
    "print-marginBottom",
    10
  );
  const [itemsPerRow, setItemsPerRow] = useSavedState("print-itemsPerRow", 3);
  const [paperSize, setPaperSize] = useSavedState("print-paperSize", "A4");
  const [rowHeight, setRowHeight] = useSavedState("print-rowHeight", 70);
  const [previewScale, setPreviewScale] = useSavedState(
    "print-previewScale",
    0.6
  );
  const [showBorder, setShowBorder] = useSavedState("print-showBorder", true);

  const paperWidth = paperDimensions[paperSize].width;
  const paperHeight = paperDimensions[paperSize].height;

  const printRef = useRef<HTMLDivElement>(null);

  const itemsPerPage =
    itemsPerRow *
    Math.floor((paperHeight - marginTop - marginBottom) / rowHeight);
  const pageBlocks = [];
  for (let i = 0; i < items.length; i += 1) {
    if (i % itemsPerPage === 0) {
      pageBlocks.push(items.slice(i, i + itemsPerPage));
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
        {pageBlock.map((item, index) => (
          <div
            key={index}
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              width: `${
                (paperWidth - marginLeft - marginRight - 1) / itemsPerRow
              }mm`,
              height: `${rowHeight}mm`,
              flexDirection: "column",
            }}
          >
            {item}
          </div>
        ))}
      </Row>
    </div>
  ));

  return (
    <Modal
      open={visible}
      title={title ?? "Printing Dialog"}
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
                ${style ?? ""}
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
            <Form.Item label="Left Margin">
              <Slider
                min={0}
                max={50}
                tooltip={{ formatter: (value) => `${value} mm` }}
                value={marginLeft}
                onChange={(value) => {
                  setMarginLeft(value);
                }}
              />
            </Form.Item>
            <Form.Item label="Top Margin">
              <Slider
                min={0}
                max={50}
                tooltip={{ formatter: (value) => `${value} mm` }}
                value={marginTop}
                onChange={(value) => {
                  setMarginTop(value);
                }}
              />
            </Form.Item>
            <Form.Item label="Right Margin">
              <Slider
                min={0}
                max={50}
                tooltip={{ formatter: (value) => `${value} mm` }}
                value={marginRight}
                onChange={(value) => {
                  setMarginRight(value);
                }}
              />
            </Form.Item>
            <Form.Item label="Bottom Margin">
              <Slider
                min={0}
                max={50}
                tooltip={{ formatter: (value) => `${value} mm` }}
                value={marginBottom}
                onChange={(value) => {
                  setMarginBottom(value);
                }}
              />
            </Form.Item>
            <Form.Item label="Columns">
              <Slider
                min={1}
                max={5}
                value={itemsPerRow}
                onChange={(value) => {
                  setItemsPerRow(value);
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
            <Form.Item label="Row Height">
              <Slider
                min={30}
                max={200}
                tooltip={{ formatter: (value) => `${value} mm` }}
                value={rowHeight}
                onChange={(value) => {
                  setRowHeight(value);
                }}
              />
            </Form.Item>
            <Form.Item label="Show Border">
              <Switch
                checked={showBorder}
                onChange={(checked) => setShowBorder(checked)}
              />
            </Form.Item>
            {extraSettings && <Divider />}
            {extraSettings}
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

export default PrintingDialog;
