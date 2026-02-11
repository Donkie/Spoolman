import { DownloadOutlined } from "@ant-design/icons";
import { useTranslate } from "@refinedev/core";
import { Button, Checkbox, Col, Collapse, Divider, Form, InputNumber, Radio, Row, Slider, Space } from "antd";
import * as htmlToImage from "html-to-image";
import { ReactElement, useRef } from "react";
import { useSavedState } from "../../utils/saveload";
import { PrintSettings } from "./printing";

interface ExportDialogProps {
  items: ReactElement[];
  printSettings: PrintSettings;
  setPrintSettings: (setPrintSettings: PrintSettings) => void;
  style?: string;
  extraSettings?: ReactElement;
  extraSettingsStart?: ReactElement;
  extraButtons?: ReactElement;
}

const ExportDialog = ({
  items,
  printSettings,
  setPrintSettings,
  style,
  extraSettings,
  extraSettingsStart,
  extraButtons,
}: ExportDialogProps) => {
  const t = useTranslate();

  const [collapseState, setCollapseState] = useSavedState<string[]>("export-collapseState", []);
  const [previewScale, setPreviewScale] = useSavedState("export-previewScale", 0.7);

  const margin = printSettings?.margin || { top: 0, bottom: 0, left: 0, right: 0 };
  const printerMargin = printSettings?.printerMargin || { top: 0, bottom: 0, left: 0, right: 0 };
  const customPaperSize = printSettings?.customPaperSize || { width: 40, height: 30 };
  const exportDpi = printSettings?.exportDpi || 300;
  const exportFormat = printSettings?.exportFormat || "aml";
  const exportAmlAsPages = printSettings?.exportAmlAsPages ?? false;

  const paperWidth = customPaperSize.width;
  const paperHeight = customPaperSize.height;
  const itemWidth = Math.max(paperWidth - margin.left - margin.right, 0);
  const itemHeight = Math.max(paperHeight - margin.top - margin.bottom, 0);

  const contentRef = useRef<HTMLDivElement>(null);

  const pageBlocks: ReactElement[][] = [];
  for (const item of items) {
    pageBlocks.push([item]);
  }

  const pages = pageBlocks.map(function (pageItems, pageIdx) {
    const itemDivs = pageItems.map((item, itemIdx) => {
      return (
        <div
          key={itemIdx}
          className="print-page-item"
          style={{
            width: `${itemWidth}mm`,
            height: `${itemHeight}mm`,
            paddingLeft: `${Math.max(printerMargin.left - margin.left, 0)}mm`,
            paddingRight: `${Math.max(printerMargin.right - margin.right, 0)}mm`,
            paddingTop: `${Math.max(printerMargin.top - margin.top, 0)}mm`,
            paddingBottom: `${Math.max(printerMargin.bottom - margin.bottom, 0)}mm`,
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
            height: `${paperHeight - margin.top - margin.bottom}mm`,
            width: `${paperWidth - margin.left - margin.right}mm`,
            marginTop: `${margin.top}mm`,
            marginLeft: `${margin.left}mm`,
            marginRight: `${margin.right}mm`,
            marginBottom: `${margin.bottom}mm`,
          }}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
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

  const getExportImageOptions = () => {
    const exportPixelRatio = Math.max(1, Math.min(exportDpi / 96, 10));
    return {
      backgroundColor: "#FFF",
      cacheBust: true,
      pixelRatio: exportPixelRatio,
    };
  };

  const saveAsImage = async () => {
    const hasPrinted: Element[] = [];
    const itemsToPrint = getPrintItems();
    const usedNames = new Set<string>();
    let idx = 1;

    for (const item of itemsToPrint) {
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

      const url = await htmlToImage.toPng(item as HTMLElement, getExportImageOptions());
      const link = document.createElement("a");
      link.href = url;
      link.download = `${safeName}.png`;
      link.click();
      idx += 1;
    }
  };

  const saveAsAmlLabels = async () => {
    const hasPrinted: Element[] = [];
    const itemsToPrint = getPrintItems();
    const usedNames = new Set<string>();
    let idx = 1;

    for (const item of itemsToPrint) {
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

      const url = await htmlToImage.toPng(item as HTMLElement, getExportImageOptions());
      const base64 = url.split(",")[1] ?? "";
      const aml = buildAmlXml(safeName, paperWidth, paperHeight, base64);
      downloadTextFile(`${safeName}.aml`, aml, "application/xml");
      idx += 1;
    }
  };

  const saveAsAmlPages = async () => {
    const pagesToPrint = getPrintPages();
    let pageIdx = 1;

    for (const page of pagesToPrint) {
      const url = await htmlToImage.toPng(page as HTMLElement, getExportImageOptions());
      const base64 = url.split(",")[1] ?? "";
      const name = `labels-page-${pageIdx}`;
      const aml = buildAmlXml(name, paperWidth, paperHeight, base64);
      downloadTextFile(`${name}.aml`, aml, "application/xml");
      pageIdx += 1;
    }
  };

  const handleExport = async () => {
    if (exportFormat === "png") {
      await saveAsImage();
      return;
    }
    if (exportAmlAsPages) {
      await saveAsAmlPages();
      return;
    }
    await saveAsAmlLabels();
  };

  return (
    <>
      <Row gutter={16}>
        <Col
          span={14}
          style={{
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
          <div style={{ maxHeight: "calc(100vh - 260px)", overflowY: "auto", paddingRight: 8 }}>
            <Form labelAlign="left" colon={false} labelWrap={true} labelCol={{ span: 8 }} wrapperCol={{ span: 16 }}>
              {extraSettingsStart}
              <Divider />
              <Form.Item label={t("printing.generic.exportFormat")}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <Radio.Group
                    options={[
                      { label: t("printing.generic.exportFormatOptions.png"), value: "png" },
                      { label: t("printing.generic.exportFormatOptions.aml"), value: "aml" },
                    ]}
                    onChange={(e) => {
                      printSettings.exportFormat = e.target.value;
                      setPrintSettings(printSettings);
                    }}
                    value={exportFormat}
                    optionType="button"
                    buttonStyle="solid"
                  />
                  {exportFormat === "aml" && (
                    <Checkbox
                      checked={exportAmlAsPages}
                      onChange={(event) => {
                        printSettings.exportAmlAsPages = event.target.checked;
                        setPrintSettings(printSettings);
                      }}
                    >
                      {t("printing.generic.exportAmlPages")}
                    </Checkbox>
                  )}
                </div>
              </Form.Item>
              <Form.Item label={t("printing.generic.exportDpi")} help={t("printing.generic.exportDpiHelp")}>
                <Row>
                  <Col span={12}>
                    <Slider
                      min={72}
                      max={600}
                      step={1}
                      tooltip={{ formatter: (value) => `${value} dpi` }}
                      value={exportDpi}
                      onChange={(value) => {
                        printSettings.exportDpi = value;
                        setPrintSettings(printSettings);
                      }}
                    />
                  </Col>
                  <Col span={12}>
                    <InputNumber
                      min={72}
                      max={1200}
                      step={1}
                      style={{ margin: "0 16px" }}
                      value={exportDpi}
                      addonAfter="dpi"
                      onChange={(value) => {
                        printSettings.exportDpi = value ?? 300;
                        setPrintSettings(printSettings);
                      }}
                    />
                  </Col>
                </Row>
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
                  <Form.Item label={t("printing.generic.dimensions")}>
                    <Row align="middle">
                      <Col span={11}>
                        <InputNumber
                          value={customPaperSize.width}
                          min={1}
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
                          min={1}
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
                          min={-20}
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
                          min={-20}
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
                          min={-20}
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
                          min={-20}
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
                </Collapse.Panel>
              </Collapse>
            </Form>
          </div>
        </Col>
      </Row>
      <Row justify={"end"}>
        <Col>
          <Space>
            {extraButtons}
            <Button type="primary" icon={<DownloadOutlined />} size="large" onClick={handleExport}>
              {t("printing.generic.exportLabels")}
            </Button>
          </Space>
        </Col>
      </Row>
    </>
  );
};

export default ExportDialog;
