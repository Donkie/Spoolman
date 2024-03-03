import { Cascader, Col, Collapse, Form, Input, InputNumber, Modal, Radio, Select, Switch, Typography } from "antd";
import { ISpool, ISpoolEportableKeys } from "../../../pages/spools/model";
import { useSavedState } from "../../../utils/saveload";
import { useTranslate } from "@refinedev/core";
import { RadioChangeEvent } from "antd/lib";
import { numberFormatter, numberParser } from "../../../utils/parsing";
import { QRExportOptions, exportQRCode, transformSpoolToQRContent } from "../../../utils/qrcodeGeneration";
import { BaseOptionType, DefaultOptionType } from "antd/es/cascader";
import { CSVExportConfig, exportAsCSV } from "../../../utils/csvGeneration";

interface SpoolExportDialog {
  visible: boolean;
  items: ISpool[];
  onCancel: () => void;
}

const SpoolExportDialog: React.FC<SpoolExportDialog> = ({ visible, items, onCancel }) => {
  const t = useTranslate();

  const [qrForm] = Form.useForm();
  const [csvForm] = Form.useForm();

  const [exportType, setExportType] = useSavedState<"QR-Code" | "CSV">("export-exportType", "QR-Code");
  const [exportField, setExportField] = useSavedState<(string | number)[][]>("export-exportField", [["id"], ["registered"], ["first_used"], ["last_used"], ["filament"], ["price"], ["remaining_weight"], ["used_weight"]]);

  const [csvExportOptions, setCSVExportOptions] = useSavedState<CSVExportConfig>("export-CSVOptions-spool", {
    delimiter: ";",
    includeHeaders: true,
    filename: "Spool Export",
  });
  const [qrExportOptions, setQRExportOptions] = useSavedState<QRExportOptions>("export-qrOptions-spool", {
    boxSize: 32,
    padding: 2,
    useFullURL: false,
  });

  const exportSpools = async () => {
    switch (exportType) {
      case 'CSV': {
        const formValid = await csvForm.validateFields();

        if (formValid.errorFields && formValid.errorFields.length > 0) {
          return;
        }

        exportAsCSV(items, {
          delimiter: csvExportOptions.delimiter,
          includeHeaders: csvExportOptions.includeHeaders,
          filename: csvExportOptions.filename,
          options: exportField,
        });
        break;
      }

      case 'QR-Code': {
        const formValid = await qrForm.validateFields();

        if (formValid.errorFields && formValid.errorFields.length > 0) {
          return;
        }

        exportQRCode(items.map(
          (spool) => transformSpoolToQRContent(spool, qrExportOptions.useFullURL)
        ), qrExportOptions);
        break;
      }

      default:
        break;
    }
  }

  return (
    <Modal
      open={visible}
      title={t("exporting.generic.title")}
      onCancel={onCancel}
      onOk={exportSpools}
      okText={t("exporting.generic.export")}
    >
      <Col>
        <Col
          style={{
            whiteSpace: "pre-line",
            marginBottom: "1em",
          }}
        >
          {t("exporting.generic.description")}
        </Col>
        <Col>
          <Form.Item label={t("exporting.generic.exportType")}>
            <Radio.Group
              options={[
                { label: "QR-Code", value: "QR-Code" },
                { label: "CSV", value: "CSV" },
              ]}
              onChange={(e: RadioChangeEvent) => {
                setExportType(e.target.value);
              }}
              value={exportType}
              optionType="button"
              buttonStyle="solid"
            />
          </Form.Item>
        </Col>
        <Col hidden={exportType != 'QR-Code'}>
          {t("exporting.generic.qrOptions.title")}
          <Form form={qrForm}>
            <Form.Item
              label={t("exporting.generic.qrOptions.size")}
              name={["boxSize"]}
              help={t("exporting.generic.qrOptions.sizeHelp")}
              initialValue={qrExportOptions.boxSize}
              rules={[
                {
                  required: true,
                  type: "number",
                  min: 12,
                },
              ]}
            >
              <InputNumber
                formatter={numberFormatter}
                parser={numberParser}
                onChange={(value) => {
                  if (value == null) return;

                  setQRExportOptions({ ...qrExportOptions, boxSize: value });
                }}
              />
            </Form.Item>
            <Form.Item
              label={t("exporting.generic.qrOptions.padding")}
              name={["padding"]}
              help={t("exporting.generic.qrOptions.paddingHelp")}
              initialValue={qrExportOptions.padding}
              rules={[
                {
                  required: true,
                  type: "number",
                },
              ]}
            >
              <InputNumber
                formatter={numberFormatter}
                parser={numberParser}
                onChange={(value) => {
                  if (value == null) return;

                  setQRExportOptions({ ...qrExportOptions, padding: value });
                }}
              />
            </Form.Item>
            <Form.Item
              label={t("exporting.generic.qrOptions.useFullUrl")}
              name={["useFullURL"]}
              help={t("exporting.generic.qrOptions.useFullUrlHelp")}
            >
              <Switch
                checked={qrExportOptions.useFullURL}
                onChange={(checked) => {
                  setQRExportOptions({ ...qrExportOptions, useFullURL: checked });
                }}
              />
            </Form.Item>
          </Form>
        </Col>
        <Col hidden={exportType != 'CSV'}>
          {t("exporting.generic.csvOptions.title")}
          <Form form={csvForm}>
            <Form.Item label={t("exporting.generic.csvOptions.delimiter")}>
              <Input
                value={csvExportOptions.delimiter}
                onChange={(e) => {
                  setCSVExportOptions({ ...csvExportOptions, delimiter: e.target.value });
                }}
              />
            </Form.Item>
            <Form.Item label={t("exporting.generic.csvOptions.includeHeaders")}>
              <Switch
                checked={csvExportOptions.includeHeaders}
                onChange={(checked) => {
                  setCSVExportOptions({ ...csvExportOptions, includeHeaders: checked });
                }}
              />
            </Form.Item>
            <Typography.Title level={5}>{t('exporting.generic.csvOptions.fieldsToExport')}</Typography.Title>
            <Cascader
              defaultValue={exportField}
              onChange={(value) => {
                setExportField(value);
              }}
              multiple
              style={{ width: '100%' }}
              options={ISpoolEportableKeys(t)}
            />
          </Form>
        </Col>
      </Col>
    </Modal>
  );
};

export default SpoolExportDialog;
