import { Col, Form, Input, Modal, Switch } from "antd";
import { useSavedState } from "../../../utils/saveload";
import { CSVExportOptions, exportAsCSV } from "../functions";
import { useTranslate } from "@refinedev/core";
import { IVendor } from "../../../pages/vendors/model";

interface VendorExportDialog {
  visible: boolean;
  items: IVendor[];
  onCancel: () => void;
}

const VendorExportDialog: React.FC<VendorExportDialog> = ({ visible, items, onCancel }) => {
  const t = useTranslate();

  const [csvExportOptions, setCSVExportOptions] = useSavedState<CSVExportOptions<IVendor>>("export-CSVOptions-vendor", {
    delimiter: ";",
    includeHeaders: true,
    filename: "Vendor Export",
  });


  return (
    <Modal
      open={visible}
      title={t("exporting.generic.title")}
      onCancel={onCancel}
      onOk={() => exportAsCSV(items, csvExportOptions)}
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
          <Form.Item label={t("vendor.fields.id")}>
            <Switch
              checked={csvExportOptions.id}
              onChange={(checked) => {
                setCSVExportOptions({ ...csvExportOptions, id: checked });
              }}
            />
          </Form.Item>
          <Form.Item label={t("vendor.fields.registered")}>
            <Switch
              checked={csvExportOptions.registered}
              onChange={(checked) => {
                setCSVExportOptions({ ...csvExportOptions, registered: checked });
              }}
            />
          </Form.Item>
          <Form.Item label={t("vendor.fields.name")}>
            <Switch
              checked={csvExportOptions.name}
              onChange={(checked) => {
                setCSVExportOptions({ ...csvExportOptions, name: checked });
              }}
            />
          </Form.Item>
          <Form.Item label={t("vendor.fields.comment")}>
            <Switch
              checked={csvExportOptions.comment}
              onChange={(checked) => {
                setCSVExportOptions({ ...csvExportOptions, comment: checked });
              }}
            />
          </Form.Item>
        </Col>
      </Col>
    </Modal>
  );
};

export default VendorExportDialog;
