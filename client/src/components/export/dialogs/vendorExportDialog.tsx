import { Cascader, Col, Form, Input, Modal, Switch, Typography } from "antd";
import { useSavedState } from "../../../utils/saveload";
import { useTranslate } from "@refinedev/core";
import { IVendor, IVendorEportableKeys } from "../../../pages/vendors/model";
import { CSVExportConfig, exportAsCSV } from "../../../utils/csvGeneration";

interface VendorExportDialog {
  visible: boolean;
  items: IVendor[];
  onCancel: () => void;
}

const VendorExportDialog: React.FC<VendorExportDialog> = ({ visible, items, onCancel }) => {
  const t = useTranslate();

  const [csvExportOptions, setCSVExportOptions] = useSavedState<CSVExportConfig>("export-CSVOptions-vendor", {
    delimiter: ";",
    includeHeaders: true,
    filename: "Vendor Export",
  });

  const [exportField, setExportField] = useSavedState<(string | number)[][]>("export-vendor-exportField", [["id"], ["registered"], ["name"], ["comment"], ["extra"]]);

  return (
    <Modal
      open={visible}
      title={t("exporting.generic.title")}
      onCancel={onCancel}
      onOk={() => exportAsCSV(items, {
        delimiter: csvExportOptions.delimiter,
        includeHeaders: csvExportOptions.includeHeaders,
        filename: csvExportOptions.filename,
        options: exportField,
      })}
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
          {t("exporting.generic.csvOptions.title")}
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
              options={IVendorEportableKeys(t)}
            />
        </Col>
      </Col>
    </Modal>
  );
};

export default VendorExportDialog;
