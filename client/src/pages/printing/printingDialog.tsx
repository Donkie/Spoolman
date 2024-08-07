import { FileImageOutlined, PrinterOutlined } from "@ant-design/icons";
import { useTranslate } from "@refinedev/core";
import {
  Button,
  Col,
  Collapse,
  Divider,
  Form,
  InputNumber,
  Radio,
  RadioChangeEvent,
  Row,
  Select,
  Slider,
  Space,
} from "antd";
import * as htmlToImage from "html-to-image";
import React, { useRef } from "react";
import ReactToPrint from "react-to-print";
import { useSavedState } from "../../utils/saveload";
import { PrintSettings } from "./printing";

interface PrintingDialogProps {
  items: JSX.Element[];
  printSettings: PrintSettings;
  setPrintSettings: (setPrintSettings: PrintSettings) => void;
  style?: string;
  extraSettings?: JSX.Element;
  extraSettingsStart?: JSX.Element;
  extraButtons?: JSX.Element;
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
  printSettings,
  setPrintSettings,
  style,
  extraSettings,
  extraSettingsStart,
  extraButtons,
}) => {
  const t = useTranslate();

  const [collapseState, setCollapseState] = useSavedState<string[]>("print-collapseState", []);
  const [previewScale, setPreviewScale] = useSavedState("print-previewScale", 0.6);

  const margin = printSettings?.margin || { top: 10, bottom: 10, left: 10, right: 10 };
  const printerMargin = printSettings?.printerMargin || { top: 5, bottom: 5, left: 5, right: 5 };
  const spacing = printSettings?.spacing || { horizontal: 0, vertical: 0 };
  const paperColumns = printSettings?.columns || 3;
  const paperRows = printSettings?.rows || 8;
  const skipItems = printSettings?.skipItems || 0;
  const itemCopies = printSettings?.itemCopies || 1;
  const paperSize = printSettings?.paperSize || "A4";
  const customPaperSize = printSettings?.customPaperSize || { width: 210, height: 297 };
  const borderShowMode = printSettings?.borderShowMode || "grid";

  const paperWidth = paperSize === "custom" ? customPaperSize.width : paperDimensions[paperSize].width;
  const paperHeight = paperSize === "custom" ? customPaperSize.height : paperDimensions[paperSize].height;

  const printRef = useRef<HTMLDivElement>(null);

  const itemWidth = (paperWidth - margin.left - margin.right - spacing.horizontal) / paperColumns - spacing.horizontal;
  const itemHeight = (paperHeight - margin.top - margin.bottom - spacing.vertical) / paperRows - spacing.vertical;

  const itemsPerRow = paperColumns;
  const itemsPerPage = itemsPerRow * paperRows;

  const itemsIncludingSkipped = [...Array(skipItems).fill(<></>)];
  for (const item of items) {
    for (let i = 0; i < itemCopies; i += 1) {
      itemsIncludingSkipped.push(item);
    }
  }

  const pageBlocks = [];
  for (let page_idx = 0; page_idx < itemsIncludingSkipped.length / itemsPerPage; page_idx += 1) {
    pageBlocks.push(itemsIncludingSkipped.slice(page_idx * itemsPerPage, (page_idx + 1) * itemsPerPage));
  }

  const pages = pageBlocks.map(function (items, pageIdx) {
    const itemDivs = items.map((item, itemIdx) => {
      const isFirstColumn = itemIdx % itemsPerRow === 0;
      const isLastColumn = (itemIdx + 1) % itemsPerRow === 0;
      const isFirstRow = itemIdx < itemsPerRow;
      const isLastRow = itemsPerPage - itemIdx <= itemsPerRow;

      return (
        <div
          key={itemIdx}
          className="print-page-item"
          style={{
            width: `${itemWidth}mm`,
            height: `${itemHeight}mm`,
            border: borderShowMode === "grid" ? "1px solid #000" : "none",
            paddingLeft: isFirstColumn ? `${Math.max(printerMargin.left - margin.left, 0)}mm` : 0,
            paddingRight: isLastColumn ? `${Math.max(printerMargin.right - margin.right, 0)}mm` : 0,
            paddingTop: isFirstRow ? `${Math.max(printerMargin.top - margin.top, 0)}mm` : 0,
            paddingBottom: isLastRow ? `${Math.max(printerMargin.bottom - margin.bottom, 0)}mm` : 0,
          }}
        >
          {item}
        </div>
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
            outline: borderShowMode !== "none" ? "1px solid #000" : "none",
            outlineOffset: "-1px",
            height: `${paperHeight - margin.top - margin.bottom}mm`,
            width: `${paperWidth - margin.left - margin.right}mm`,
            marginTop: `calc(${margin.top}mm - ${borderShowMode !== "none" ? "1px" : "0px"})`,
            marginLeft: `calc(${margin.left}mm - ${borderShowMode !== "none" ? "1px" : "0px"})`,
            marginRight: `calc(${margin.right}mm - ${borderShowMode !== "none" ? "1px" : "0px"})`,
            marginBottom: `calc(${margin.bottom}mm - ${borderShowMode !== "none" ? "1px" : "0px"})`,
          }}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              rowGap: `${spacing.vertical}mm`,
              columnGap: `${spacing.horizontal}mm`,
              paddingTop: `${spacing.vertical}mm`,
              paddingLeft: `${spacing.horizontal}mm`,
            }}
          >
            {itemDivs}
          </div>
        </div>
      </div>
    );
  });

  const saveAsImage = () => {
    const hasPrinted: Element[] = [];

    Array.from(document.getElementsByClassName("print-qrcode-item")).forEach(async (item) => {
      // Prevent printing copies
      for (let i = 0; i < hasPrinted.length; i += 1) {
        if (item.isEqualNode(hasPrinted[i])) return;
      }
      hasPrinted.push(item);

      // Generate png image
      const url = await htmlToImage.toPng(item as HTMLElement, {
        backgroundColor: "#FFF",
        cacheBust: true,
      });

      // Download image
      const link = document.createElement("a");
      link.href = url;
      link.download = "spoolmanlabel.png";
      link.click();
    });
  };

  return (
    <>
      <Row gutter={16}>
        <Col
          span={14}
          style={{
            // This magic makes this column take the height of the sibling column
            // https://stackoverflow.com/a/49065029/2911165
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
              ref={printRef}
              style={{
                transform: `scale(${previewScale})`,
                transformOrigin: "top left",
              }}
            >
              <style>
                {`
                @media print {
                  html, body {
                    height: initial !important;
                    overflow: initial !important;
                    -webkit-print-color-adjust: exact;
                  }
                    
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

                .print-page {
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji';
                  line-height: 1.2;
                }

                .print-page * {
                  box-sizing: border-box;
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
            {extraSettingsStart}
            <Divider />
            <Form.Item label={t("printing.generic.skipItems")}>
              <Row>
                <Col span={12}>
                  <Slider
                    min={0}
                    max={30}
                    value={skipItems}
                    onChange={(value) => {
                      printSettings.skipItems = value;
                      setPrintSettings(printSettings);
                    }}
                  />
                </Col>
                <Col span={12}>
                  <InputNumber
                    min={0}
                    style={{ margin: "0 16px" }}
                    value={skipItems}
                    onChange={(value) => {
                      printSettings.skipItems = value ?? 1;
                      setPrintSettings(printSettings);
                    }}
                  />
                </Col>
              </Row>
            </Form.Item>
            <Form.Item label={t("printing.generic.itemCopies")}>
              <Row>
                <Col span={12}>
                  <Slider
                    min={1}
                    max={3}
                    value={itemCopies}
                    onChange={(value) => {
                      printSettings.itemCopies = value;
                      setPrintSettings(printSettings);
                    }}
                  />
                </Col>
                <Col span={12}>
                  <InputNumber
                    min={1}
                    style={{ margin: "0 16px" }}
                    value={itemCopies}
                    onChange={(value) => {
                      printSettings.itemCopies = value ?? 1;
                      setPrintSettings(printSettings);
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
                  printSettings.borderShowMode = e.target.value;
                  setPrintSettings(printSettings);
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
                {t("printing.generic.description")}
                <Divider />
                <Form.Item label={t("printing.generic.paperSize")}>
                  <Select
                    value={paperSize}
                    onChange={(value) => {
                      printSettings.paperSize = value;
                      setPrintSettings(printSettings);
                    }}
                  >
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
                        value={customPaperSize.width}
                        min={0.1}
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
                        min={0.1}
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
                <Form.Item label={t("printing.generic.columns")}>
                  <Row>
                    <Col span={12}>
                      <Slider
                        min={1}
                        max={5}
                        value={paperColumns}
                        onChange={(value) => {
                          printSettings.columns = value;
                          setPrintSettings(printSettings);
                        }}
                      />
                    </Col>
                    <Col span={12}>
                      <InputNumber
                        min={1}
                        style={{ margin: "0 16px" }}
                        value={paperColumns}
                        onChange={(value) => {
                          printSettings.columns = value ?? 1;
                          setPrintSettings(printSettings);
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
                          printSettings.rows = value;
                          setPrintSettings(printSettings);
                        }}
                      />
                    </Col>
                    <Col span={12}>
                      <InputNumber
                        min={1}
                        style={{ margin: "0 16px" }}
                        value={paperRows}
                        onChange={(value) => {
                          printSettings.rows = value ?? 1;
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
                        min={0}
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
                        min={0}
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
                        min={0}
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
                        min={0}
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
                <Divider />
                <Form.Item label={t("printing.generic.horizontalSpacing")}>
                  <Row>
                    <Col span={12}>
                      <Slider
                        min={0}
                        max={20}
                        step={0.1}
                        tooltip={{ formatter: (value) => `${value} mm` }}
                        value={spacing.horizontal}
                        onChange={(value) => {
                          spacing.horizontal = value;
                          printSettings.spacing = spacing;
                          setPrintSettings(printSettings);
                        }}
                      />
                    </Col>
                    <Col span={12}>
                      <InputNumber
                        step={0.1}
                        style={{ margin: "0 16px" }}
                        value={spacing.horizontal}
                        addonAfter="mm"
                        onChange={(value) => {
                          spacing.horizontal = value ?? 0;
                          printSettings.spacing = spacing;
                          setPrintSettings(printSettings);
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
                        value={spacing.vertical}
                        onChange={(value) => {
                          spacing.vertical = value;
                          printSettings.spacing = spacing;
                          setPrintSettings(printSettings);
                        }}
                      />
                    </Col>
                    <Col span={12}>
                      <InputNumber
                        step={0.1}
                        style={{ margin: "0 16px" }}
                        value={spacing.vertical}
                        addonAfter="mm"
                        onChange={(value) => {
                          spacing.vertical = value ?? 0;
                          printSettings.spacing = spacing;
                          setPrintSettings(printSettings);
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
      <Row justify={"end"}>
        <Col>
          <Space>
            {extraButtons}
            <Button type="primary" icon={<FileImageOutlined />} size="large" onClick={saveAsImage}>
              {t("printing.generic.saveAsImage")}
            </Button>
            <ReactToPrint
              key="print-button"
              trigger={() => (
                <Button type="primary" icon={<PrinterOutlined />} size="large">
                  {t("printing.generic.print")}
                </Button>
              )}
              content={() => printRef.current}
            />
          </Space>
        </Col>
      </Row>
    </>
  );
};

export default PrintingDialog;
