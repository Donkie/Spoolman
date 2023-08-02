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
  RadioChangeEvent,
  Radio,
  InputNumber,
} from "antd";
import ReactToPrint from "react-to-print";
import { useSavedState } from "../../utils/saveload";
import { useTranslate } from "@refinedev/core";

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
  const t = useTranslate();

  const [marginLeft, setMarginLeft] = useSavedState("print-marginLeft", 10);
  const [marginTop, setMarginTop] = useSavedState("print-marginTop", 10);
  const [marginRight, setMarginRight] = useSavedState("print-marginRight", 10);
  const [marginBottom, setMarginBottom] = useSavedState(
    "print-marginBottom",
    10
  );
  const [itemsPerRow, setItemsPerRow] = useSavedState("print-itemsPerRow", 3);
  const [rowsPerPage, setRowsPerPage] = useSavedState("print-rowsPerPage", 8);
  const [paperSize, setPaperSize] = useSavedState("print-paperSize", "A4");
  const [previewScale, setPreviewScale] = useSavedState(
    "print-previewScale",
    0.6
  );
  const [borderShowMode, setBorderShowMode] = useSavedState<
    "none" | "border" | "grid"
  >("print-borderShowMode", "grid");

  const paperWidth = paperDimensions[paperSize].width;
  const paperHeight = paperDimensions[paperSize].height;

  const printRef = useRef<HTMLDivElement>(null);

  const calculatedRowHeight =
    (paperHeight - marginTop - marginBottom) / rowsPerPage;

  const rowsOfItems = [];
  for (let row_idx = 0; row_idx <= items.length / itemsPerRow; row_idx += 1) {
    rowsOfItems.push(
      items.slice(row_idx * itemsPerRow, (row_idx + 1) * itemsPerRow)
    );
  }

  const pageBlocks = [];
  for (
    let page_idx = 0;
    page_idx <= rowsOfItems.length / rowsPerPage;
    page_idx += 1
  ) {
    pageBlocks.push(
      rowsOfItems.slice(page_idx * rowsPerPage, (page_idx + 1) * rowsPerPage)
    );
  }

  const pages = pageBlocks.map(function (rows, idx) {
    const itemRows = rows.map((row, idx) => {
      return (
        <tr key={idx}>
          {row.map((item, index) => (
            <td>
              <div
                key={index}
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  width: `${
                    (paperWidth - marginLeft - marginRight) / itemsPerRow
                  }mm`,
                  height: `${calculatedRowHeight}mm`,
                  flexDirection: "column",
                  border: borderShowMode === "grid" ? "1px solid #000" : "none",
                }}
              >
                {item}
              </div>
            </td>
          ))}
        </tr>
      );
    });

    return (
      <div
        className="print-page"
        key={idx}
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
            marginTop: `calc(${marginTop}mm - ${
              borderShowMode !== "none" ? "1px" : "0px"
            })`,
            marginLeft: `calc(${marginLeft}mm - ${
              borderShowMode !== "none" ? "1px" : "0px"
            })`,
            marginRight: `calc(${marginRight}mm - ${
              borderShowMode !== "none" ? "1px" : "0px"
            })`,
            marginBottom: `calc(${marginBottom}mm - ${
              borderShowMode !== "none" ? "1px" : "0px"
            })`,
          }}
        >
          <table
            style={{
              border: borderShowMode !== "none" ? "1px solid #000" : "none",
              width: "100%",
              height: "100%",
              alignContent: "flex-start",
            }}
          >
            {itemRows}
          </table>
        </div>
      </div>
    );
  });

  return (
    <Modal
      open={visible}
      title={title ?? t("printing.generic.title")}
      onCancel={onCancel}
      footer={[
        <ReactToPrint
          key="print-button"
          trigger={() => (
            <Button type="primary">{t("printing.generic.print")}</Button>
          )}
          content={() => printRef.current}
        />,
      ]}
      width={1200} // Set the modal width to accommodate the preview
    >
      <Row gutter={16}>
        <Col span={24}>{t("printing.generic.description")}</Col>
        <Col span={14}>
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

                .print-page td {
                    padding: 0;
                }
                ${style ?? ""}
                `}
              </style>
              {pages}
            </div>
          </div>
        </Col>
        <Col span={10}>
          <Form
            labelAlign="left"
            colon={false}
            labelCol={{ span: 8 }}
            wrapperCol={{ span: 16 }}
          >
            <Form.Item label={t("printing.generic.marginLeft")}>
              <Row>
                <Col span={12}>
                  <Slider
                    min={-20}
                    max={50}
                    step={0.1}
                    tooltip={{ formatter: (value) => `${value} mm` }}
                    value={marginLeft}
                    onChange={(value) => {
                      setMarginLeft(value);
                    }}
                  />
                </Col>
                <Col span={12}>
                  <InputNumber
                    step={0.1}
                    style={{ margin: "0 16px" }}
                    value={marginLeft}
                    addonAfter="mm"
                    onChange={(value) => {
                      setMarginLeft(value ?? 0);
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
                    value={marginTop}
                    onChange={(value) => {
                      setMarginTop(value);
                    }}
                  />
                </Col>
                <Col span={12}>
                  <InputNumber
                    step={0.1}
                    style={{ margin: "0 16px" }}
                    value={marginTop}
                    addonAfter="mm"
                    onChange={(value) => {
                      setMarginTop(value ?? 0);
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
                    value={marginRight}
                    onChange={(value) => {
                      setMarginRight(value);
                    }}
                  />
                </Col>
                <Col span={12}>
                  <InputNumber
                    step={0.1}
                    style={{ margin: "0 16px" }}
                    value={marginRight}
                    addonAfter="mm"
                    onChange={(value) => {
                      setMarginRight(value ?? 0);
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
                    value={marginBottom}
                    onChange={(value) => {
                      setMarginBottom(value);
                    }}
                  />
                </Col>
                <Col span={12}>
                  <InputNumber
                    step={0.1}
                    style={{ margin: "0 16px" }}
                    value={marginBottom}
                    addonAfter="mm"
                    onChange={(value) => {
                      setMarginBottom(value ?? 0);
                    }}
                  />
                </Col>
              </Row>
            </Form.Item>
            <Form.Item label={t("printing.generic.columns")}>
              <Row>
                <Col span={12}>
                  <Slider
                    min={1}
                    max={5}
                    value={itemsPerRow}
                    onChange={(value) => {
                      setItemsPerRow(value);
                    }}
                  />
                </Col>
                <Col span={12}>
                  <InputNumber
                    min={1}
                    style={{ margin: "0 16px" }}
                    value={itemsPerRow}
                    onChange={(value) => {
                      setItemsPerRow(value ?? 1);
                    }}
                  />
                </Col>
              </Row>
            </Form.Item>
            <Form.Item label={t("printing.generic.rows")}>
              <Row>
                <Col span={12}>
                  <Slider
                    min={1}
                    max={15}
                    value={rowsPerPage}
                    onChange={(value) => {
                      setRowsPerPage(value);
                    }}
                  />
                </Col>
                <Col span={12}>
                  <InputNumber
                    min={1}
                    style={{ margin: "0 16px" }}
                    value={rowsPerPage}
                    onChange={(value) => {
                      setRowsPerPage(value ?? 1);
                    }}
                  />
                </Col>
              </Row>
            </Form.Item>
            <Form.Item label={t("printing.generic.paperSize")}>
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
            <Form.Item label={t("printing.generic.showBorder")}>
              <Radio.Group
                options={[
                  { label: t("printing.generic.borders.none"), value: "none" },
                  {
                    label: t("printing.generic.borders.border"),
                    value: "border",
                  },
                  { label: t("printing.generic.borders.grid"), value: "grid" },
                ]}
                onChange={(e: RadioChangeEvent) => {
                  setBorderShowMode(e.target.value);
                }}
                value={borderShowMode}
                optionType="button"
                buttonStyle="solid"
              />
            </Form.Item>
            {extraSettings && <Divider />}
            {extraSettings}
            <Divider />
            <Form.Item label={t("printing.generic.previewScale")}>
              <Row>
                <Col span={12}>
                  <Slider
                    min={0.1}
                    max={1}
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
                    max={1}
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
          </Form>
        </Col>
      </Row>
    </Modal>
  );
};

export default PrintingDialog;
