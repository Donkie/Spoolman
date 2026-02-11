import { FileImageOutlined, FileTextOutlined, PrinterOutlined } from "@ant-design/icons";
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
import { ReactElement, useRef } from "react";
import { useReactToPrint } from "react-to-print";
import { useSavedState } from "../../utils/saveload";
import { PrintSettings } from "./printing";

interface PrintingDialogProps {
  items: ReactElement[];
  printSettings: PrintSettings;
  setPrintSettings: (setPrintSettings: PrintSettings) => void;
  style?: string;
  extraSettings?: ReactElement;
  extraSettingsStart?: ReactElement;
  extraButtons?: ReactElement;
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

const PrintingDialog = ({
  items,
  printSettings,
  setPrintSettings,
  style,
  extraSettings,
  extraSettingsStart,
  extraButtons,
}: PrintingDialogProps) => {
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
  const amlLabelSize = printSettings?.amlLabelSize || { width: 40, height: 30 };

  const paperWidth = paperSize === "custom" ? customPaperSize.width : paperDimensions[paperSize].width;
  const paperHeight = paperSize === "custom" ? customPaperSize.height : paperDimensions[paperSize].height;

  const contentRef = useRef<HTMLDivElement>(null);
  const reactToPrintFn = useReactToPrint({ contentRef });

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

  const getPrintItems = () => {
    const root = contentRef.current ?? document;
    return Array.from(root.getElementsByClassName("print-qrcode-item"));
  };

  const getPrintPages = () => {
    const root = contentRef.current ?? document;
    return Array.from(root.getElementsByClassName("print-page"));
  };

  const downloadTextFile = (filename: string, content: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const buildAmlXml = (name: string, widthMm: number, heightMm: number, base64Png: string) => {
    const width = Number.isFinite(widthMm) ? widthMm : 0;
    const height = Number.isFinite(heightMm) ? heightMm : 0;
    const validBoundsWidth = Math.max(width - 2, 0);
    const validBoundsHeight = Math.max(height - 2, 0);
    const widthIn = width / 25.4;
    const heightIn = height / 25.4;
    const id = Math.floor(Math.random() * 2 ** 31);
    const objectId = Math.floor(Math.random() * 2 ** 31);

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<LPAPI version="1.6">
      <labelName>${name}</labelName>
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
          <WdPage>
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
          </WdPage>
    </contents>
  </LPAPI>
`;
  };

  const saveAsImage = async () => {
    const hasPrinted: Element[] = [];
    const items = getPrintItems();

    for (const item of items) {
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
    }
  };

  const saveAsAmlLabels = async () => {
    const hasPrinted: Element[] = [];
    const items = getPrintItems();
    const usedNames = new Set<string>();
    let idx = 1;

    for (const item of items) {
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

      const rawName = (item as HTMLElement).dataset.amlName || `label-${idx}`;
      const safeName = rawName.replace(/[^a-zA-Z0-9-_]+/g, "-");
      if (usedNames.has(safeName)) {
        continue;
      }
      usedNames.add(safeName);

      const url = await htmlToImage.toPng(item as HTMLElement, {
        backgroundColor: "#FFF",
        cacheBust: true,
      });
      const base64 = url.split(",")[1] ?? "";
      const aml = buildAmlXml(safeName, amlLabelSize.width, amlLabelSize.height, base64);
      downloadTextFile(`${safeName}.aml`, aml, "application/xml");
      idx += 1;
    }
  };

  const saveAsAmlPages = async () => {
    const pages = getPrintPages();
    let pageIdx = 1;

    for (const page of pages) {
      const url = await htmlToImage.toPng(page as HTMLElement, {
        backgroundColor: "#FFF",
        cacheBust: true,
      });
      const base64 = url.split(",")[1] ?? "";
      const name = `labels-page-${pageIdx}`;
      const aml = buildAmlXml(name, paperWidth, paperHeight, base64);
      downloadTextFile(`${name}.aml`, aml, "application/xml");
      pageIdx += 1;
    }
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
              ref={contentRef}
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
                <Form.Item label={t("printing.generic.amlLabelSize")}>
                  <Row align="middle">
                    <Col span={11}>
                      <InputNumber
                        value={amlLabelSize.width}
                        min={1}
                        addonAfter="mm"
                        onChange={(value) => {
                          amlLabelSize.width = value ?? 0;
                          printSettings.amlLabelSize = amlLabelSize;
                          setPrintSettings(printSettings);
                        }}
                      />
                    </Col>
                    <Col span={2} style={{ textAlign: "center" }}>
                      x
                    </Col>
                    <Col span={11}>
                      <InputNumber
                        value={amlLabelSize.height}
                        min={1}
                        addonAfter="mm"
                        onChange={(value) => {
                          amlLabelSize.height = value ?? 0;
                          printSettings.amlLabelSize = amlLabelSize;
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
            <Button type="primary" icon={<FileTextOutlined />} size="large" onClick={saveAsAmlLabels}>
              {t("printing.generic.saveAsAmlLabels")}
            </Button>
            <Button type="primary" icon={<FileTextOutlined />} size="large" onClick={saveAsAmlPages}>
              {t("printing.generic.saveAsAmlPages")}
            </Button>
            <Button type="primary" icon={<FileImageOutlined />} size="large" onClick={saveAsImage}>
              {t("printing.generic.saveAsImage")}
            </Button>
            <Button type="primary" icon={<PrinterOutlined />} size="large" onClick={() => reactToPrintFn()}>
              {t("printing.generic.print")}
            </Button>
          </Space>
        </Col>
      </Row>
    </>
  );
};

export default PrintingDialog;
