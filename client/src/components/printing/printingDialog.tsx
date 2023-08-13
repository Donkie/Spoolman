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
  Collapse,
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

const PrintingDialog: React.FC<PrintingDialogProps> = ({ items, style, extraSettings, visible, onCancel, title }) => {
  const t = useTranslate();

  const [collapseState, setCollapseState] = useSavedState<string[]>("print-collapseState", []);
  const [marginLeft, setMarginLeft] = useSavedState("print-marginLeft", 10);
  const [marginTop, setMarginTop] = useSavedState("print-marginTop", 10);
  const [marginRight, setMarginRight] = useSavedState("print-marginRight", 10);
  const [marginBottom, setMarginBottom] = useSavedState("print-marginBottom", 10);
  const [horizontalSpacing, setHorizontalSpacing] = useSavedState("print-horizontalSpacing", 0);
  const [verticalSpacing, setVerticalSpacing] = useSavedState("print-verticalSpacing", 0);
  const [printerMarginLeft, setPrinterMarginLeft] = useSavedState("print-printerMarginLeft", 5);
  const [printerMarginTop, setPrinterMarginTop] = useSavedState("print-printerMarginTop", 5);
  const [printerMarginRight, setPrinterMarginRight] = useSavedState("print-printerMarginRight", 5);
  const [printerMarginBottom, setPrinterMarginBottom] = useSavedState("print-printerMarginBottom", 5);
  const [paperColumns, setPaperColumns] = useSavedState("print-itemsPerRow", 3);
  const [paperRows, setPaperRows] = useSavedState("print-rowsPerPage", 8);
  const [skipItems, setSkipItems] = useSavedState("print-skipItems", 0);
  const [paperSize, setPaperSize] = useSavedState("print-paperSize", "A4");
  const [customPaperWidth, setCustomPaperWidth] = useSavedState("print-customPaperWidth", 210);
  const [customPaperHeight, setCustomPaperHeight] = useSavedState("print-customPaperHeight", 297);
  const [previewScale, setPreviewScale] = useSavedState("print-previewScale", 0.6);
  const [borderShowMode, setBorderShowMode] = useSavedState<"none" | "border" | "grid">("print-borderShowMode", "grid");

  const paperWidth = paperSize === "custom" ? customPaperWidth : paperDimensions[paperSize].width;
  const paperHeight = paperSize === "custom" ? customPaperHeight : paperDimensions[paperSize].height;

  const printRef = useRef<HTMLDivElement>(null);

  const itemWidth = (paperWidth - marginLeft - marginRight - horizontalSpacing) / paperColumns - horizontalSpacing;
  const itemHeight = (paperHeight - marginTop - marginBottom - verticalSpacing) / paperRows - verticalSpacing;

  const itemsPerRow = paperColumns;
  const rowsPerPage = paperRows;

  const itemsIncludingSkipped = [...Array(skipItems).fill(<></>), ...items];

  const rowsOfItems = [];
  for (let row_idx = 0; row_idx <= itemsIncludingSkipped.length / itemsPerRow; row_idx += 1) {
    rowsOfItems.push(itemsIncludingSkipped.slice(row_idx * itemsPerRow, (row_idx + 1) * itemsPerRow));
  }

  const pageBlocks = [];
  for (let page_idx = 0; page_idx <= rowsOfItems.length / rowsPerPage; page_idx += 1) {
    pageBlocks.push(rowsOfItems.slice(page_idx * rowsPerPage, (page_idx + 1) * rowsPerPage));
  }

  const pages = pageBlocks.map(function (rows, pageIdx) {
    const itemRows = rows.map((row, rowIdx) => {
      return (
        <tr key={rowIdx}>
          {row.map(function (item, colIdx) {
            return (
              <td>
                <div
                  key={colIdx}
                  style={{
                    width: `${itemWidth}mm`,
                    height: `${itemHeight}mm`,
                    border: borderShowMode === "grid" ? "1px solid #000" : "none",
                    paddingLeft: colIdx === 0 ? `${Math.max(printerMarginLeft - marginLeft, 0)}mm` : 0,
                    paddingRight:
                      colIdx === paperColumns - 1 ? `${Math.max(printerMarginRight - marginRight, 0)}mm` : 0,
                    paddingTop: rowIdx === 0 ? `${Math.max(printerMarginTop - marginTop, 0)}mm` : 0,
                    paddingBottom:
                      rowIdx === paperRows - 1 ? `${Math.max(printerMarginBottom - marginBottom, 0)}mm` : 0,
                  }}
                >
                  {item}
                </div>
              </td>
            );
          })}
        </tr>
      );
    });

    return (
      <div
        className="print-page"
        key={pageIdx}
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
            border: borderShowMode !== "none" ? "1px solid #000" : "none",
            height: `${paperHeight - marginTop - marginBottom}mm`,
            width: `${paperWidth - marginLeft - marginRight}mm`,
            marginTop: `calc(${marginTop}mm - ${borderShowMode !== "none" ? "1px" : "0px"})`,
            marginLeft: `calc(${marginLeft}mm - ${borderShowMode !== "none" ? "1px" : "0px"})`,
            marginRight: `calc(${marginRight}mm - ${borderShowMode !== "none" ? "1px" : "0px"})`,
            marginBottom: `calc(${marginBottom}mm - ${borderShowMode !== "none" ? "1px" : "0px"})`,
          }}
        >
          <table
            style={{
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
          trigger={() => <Button type="primary">{t("printing.generic.print")}</Button>}
          content={() => printRef.current}
        />,
      ]}
      width={1200} // Set the modal width to accommodate the preview
    >
      <Row gutter={16}>
        <Col
          span={24}
          style={{
            whiteSpace: "pre-line",
            marginBottom: "1em",
          }}
        >
          {t("printing.generic.description")}
        </Col>
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

                .print-page table {
                    border-spacing: ${horizontalSpacing}mm ${verticalSpacing}mm;
                    border-collapse: separate;
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
          <Form labelAlign="left" colon={false} labelWrap={true} labelCol={{ span: 8 }} wrapperCol={{ span: 16 }}>
            <Form.Item label={t("printing.generic.skipItems")}>
              <Row>
                <Col span={12}>
                  <Slider
                    min={0}
                    max={30}
                    value={skipItems}
                    onChange={(value) => {
                      setSkipItems(value);
                    }}
                  />
                </Col>
                <Col span={12}>
                  <InputNumber
                    min={0}
                    style={{ margin: "0 16px" }}
                    value={skipItems}
                    onChange={(value) => {
                      setSkipItems(value ?? 1);
                    }}
                  />
                </Col>
              </Row>
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
                <Form.Item label={t("printing.generic.paperSize")}>
                  <Select value={paperSize} onChange={(value) => setPaperSize(value)}>
                    {Object.keys(paperDimensions).map((key) => (
                      <Select.Option key={key} value={key}>
                        {key}
                      </Select.Option>
                    ))}
                    <Select.Option value="custom">{t("printing.generic.customSize")}</Select.Option>
                  </Select>
                </Form.Item>
                <Form.Item label={t("printing.generic.dimensions")} hidden={paperSize !== "custom"}>
                  <Row align="middle">
                    <Col span={11}>
                      <InputNumber
                        value={customPaperWidth}
                        min={0.1}
                        addonAfter="mm"
                        onChange={(value) => setCustomPaperWidth(value ?? 0)}
                      />
                    </Col>
                    <Col span={2} style={{ textAlign: "center" }}>
                      x
                    </Col>
                    <Col span={11}>
                      <InputNumber
                        value={customPaperHeight}
                        min={0.1}
                        addonAfter="mm"
                        onChange={(value) => setCustomPaperHeight(value ?? 0)}
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
                        value={paperColumns}
                        onChange={(value) => {
                          setPaperColumns(value);
                        }}
                      />
                    </Col>
                    <Col span={12}>
                      <InputNumber
                        min={1}
                        style={{ margin: "0 16px" }}
                        value={paperColumns}
                        onChange={(value) => {
                          setPaperColumns(value ?? 1);
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
                        value={paperRows}
                        onChange={(value) => {
                          setPaperRows(value);
                        }}
                      />
                    </Col>
                    <Col span={12}>
                      <InputNumber
                        min={1}
                        style={{ margin: "0 16px" }}
                        value={paperRows}
                        onChange={(value) => {
                          setPaperRows(value ?? 1);
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
                <Divider />
                <p>{t("printing.generic.helpPrinterMargin")}</p>
                <Form.Item label={t("printing.generic.printerMarginLeft")}>
                  <Row>
                    <Col span={12}>
                      <Slider
                        min={0}
                        max={50}
                        step={0.1}
                        tooltip={{ formatter: (value) => `${value} mm` }}
                        value={printerMarginLeft}
                        onChange={(value) => {
                          setPrinterMarginLeft(value);
                        }}
                      />
                    </Col>
                    <Col span={12}>
                      <InputNumber
                        step={0.1}
                        style={{ margin: "0 16px" }}
                        value={printerMarginLeft}
                        addonAfter="mm"
                        onChange={(value) => {
                          setPrinterMarginLeft(value ?? 0);
                        }}
                      />
                    </Col>
                  </Row>
                </Form.Item>
                <Form.Item label={t("printing.generic.printerMarginTop")}>
                  <Row>
                    <Col span={12}>
                      <Slider
                        min={0}
                        max={50}
                        step={0.1}
                        tooltip={{ formatter: (value) => `${value} mm` }}
                        value={printerMarginTop}
                        onChange={(value) => {
                          setPrinterMarginTop(value);
                        }}
                      />
                    </Col>
                    <Col span={12}>
                      <InputNumber
                        step={0.1}
                        style={{ margin: "0 16px" }}
                        value={printerMarginTop}
                        addonAfter="mm"
                        onChange={(value) => {
                          setPrinterMarginTop(value ?? 0);
                        }}
                      />
                    </Col>
                  </Row>
                </Form.Item>
                <Form.Item label={t("printing.generic.printerMarginRight")}>
                  <Row>
                    <Col span={12}>
                      <Slider
                        min={0}
                        max={50}
                        step={0.1}
                        tooltip={{ formatter: (value) => `${value} mm` }}
                        value={printerMarginRight}
                        onChange={(value) => {
                          setPrinterMarginRight(value);
                        }}
                      />
                    </Col>
                    <Col span={12}>
                      <InputNumber
                        step={0.1}
                        style={{ margin: "0 16px" }}
                        value={printerMarginRight}
                        addonAfter="mm"
                        onChange={(value) => {
                          setPrinterMarginRight(value ?? 0);
                        }}
                      />
                    </Col>
                  </Row>
                </Form.Item>
                <Form.Item label={t("printing.generic.printerMarginBottom")}>
                  <Row>
                    <Col span={12}>
                      <Slider
                        min={0}
                        max={50}
                        step={0.1}
                        tooltip={{ formatter: (value) => `${value} mm` }}
                        value={printerMarginBottom}
                        onChange={(value) => {
                          setPrinterMarginBottom(value);
                        }}
                      />
                    </Col>
                    <Col span={12}>
                      <InputNumber
                        step={0.1}
                        style={{ margin: "0 16px" }}
                        value={printerMarginBottom}
                        addonAfter="mm"
                        onChange={(value) => {
                          setPrinterMarginBottom(value ?? 0);
                        }}
                      />
                    </Col>
                  </Row>
                </Form.Item>
                <Divider />
                <Form.Item label={t("printing.generic.horizontalSpacing")}>
                  <Row>
                    <Col span={12}>
                      <Slider
                        min={0}
                        max={20}
                        step={0.1}
                        tooltip={{ formatter: (value) => `${value} mm` }}
                        value={horizontalSpacing}
                        onChange={(value) => {
                          setHorizontalSpacing(value);
                        }}
                      />
                    </Col>
                    <Col span={12}>
                      <InputNumber
                        step={0.1}
                        style={{ margin: "0 16px" }}
                        value={horizontalSpacing}
                        addonAfter="mm"
                        onChange={(value) => {
                          setHorizontalSpacing(value ?? 0);
                        }}
                      />
                    </Col>
                  </Row>
                </Form.Item>
                <Form.Item label={t("printing.generic.verticalSpacing")}>
                  <Row>
                    <Col span={12}>
                      <Slider
                        min={0}
                        max={20}
                        step={0.1}
                        tooltip={{ formatter: (value) => `${value} mm` }}
                        value={verticalSpacing}
                        onChange={(value) => {
                          setVerticalSpacing(value);
                        }}
                      />
                    </Col>
                    <Col span={12}>
                      <InputNumber
                        step={0.1}
                        style={{ margin: "0 16px" }}
                        value={verticalSpacing}
                        addonAfter="mm"
                        onChange={(value) => {
                          setVerticalSpacing(value ?? 0);
                        }}
                      />
                    </Col>
                  </Row>
                </Form.Item>
              </Collapse.Panel>
            </Collapse>
          </Form>
        </Col>
      </Row>
    </Modal>
  );
};

export default PrintingDialog;
