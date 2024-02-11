import { Col, Collapse, Form, Input, Modal, Switch } from "antd";
import { IFilament } from "../../../pages/filaments/model";
import { useSavedState } from "../../../utils/saveload";
import { CSVExportOptions, exportAsCSV } from "../functions";
import { useTranslate } from "@refinedev/core";

interface FilamentExportDialog {
  visible: boolean;
  items: IFilament[];
  onCancel: () => void;
}

const FilamentExportDialog: React.FC<FilamentExportDialog> = ({ visible, items, onCancel }) => {
  const t = useTranslate();
  const [csvDefaultCollapse, setCSVDefaultCollapse] = useSavedState<string[]>("export-collapseState-csv-filament", []);

  const [csvExportOptions, setCSVExportOptions] = useSavedState<CSVExportOptions<IFilament>>("export-CSVOptions-filament", {
    delimiter: ";",
    includeHeaders: true,
    filename: "Filament Export",
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
          <Collapse
            defaultActiveKey={csvDefaultCollapse}
            bordered={false}
            ghost
            onChange={(key) => {
              if (Array.isArray(key)) {
                setCSVDefaultCollapse(key);
              }
            }}
          >
            <Collapse.Panel header={t("exporting.generic.csvOptions.filamentFields")} key="1">
              <Form.Item label={t("filament.fields.id")}>
                <Switch
                  checked={csvExportOptions.id}
                  onChange={(checked) => {
                    setCSVExportOptions({ ...csvExportOptions, id: checked });
                  }}
                />
              </Form.Item>
              <Form.Item label={t("filament.fields.registered")}>
                <Switch
                  checked={csvExportOptions.registered}
                  onChange={(checked) => {
                    setCSVExportOptions({ ...csvExportOptions, registered: checked });
                  }}
                />
              </Form.Item>
              <Form.Item label={t("filament.fields.name")}>
                <Switch
                  checked={csvExportOptions.name}
                  onChange={(checked) => {
                    setCSVExportOptions({ ...csvExportOptions, name: checked });
                  }}
                />
              </Form.Item>
              <Form.Item label={t("filament.fields.material")}>
                <Switch
                  checked={csvExportOptions.material}
                  onChange={(checked) => {
                    setCSVExportOptions({ ...csvExportOptions, material: checked });
                  }}
                />
              </Form.Item>
              <Form.Item label={t("filament.fields.price")}>
                <Switch
                  checked={csvExportOptions.price}
                  onChange={(checked) => {
                    setCSVExportOptions({ ...csvExportOptions, price: checked });
                  }}
                />
              </Form.Item>
              <Form.Item label={t("filament.fields.density")}>
                <Switch
                  checked={csvExportOptions.density}
                  onChange={(checked) => {
                    setCSVExportOptions({ ...csvExportOptions, density: checked });
                  }}
                />
              </Form.Item>
              <Form.Item label={t("filament.fields.diameter")}>
                <Switch
                  checked={csvExportOptions.diameter}
                  onChange={(checked) => {
                    setCSVExportOptions({ ...csvExportOptions, diameter: checked });
                  }}
                />
              </Form.Item>
              <Form.Item label={t("filament.fields.weight")}>
                <Switch
                  checked={csvExportOptions.weight}
                  onChange={(checked) => {
                    setCSVExportOptions({ ...csvExportOptions, weight: checked });
                  }}
                />
              </Form.Item>
              <Form.Item label={t("filament.fields.spool_weight")}>
                <Switch
                  checked={csvExportOptions.spool_weight}
                  onChange={(checked) => {
                    setCSVExportOptions({ ...csvExportOptions, spool_weight: checked });
                  }}
                />
              </Form.Item>
              <Form.Item label={t("filament.fields.article_number")}>
                <Switch
                  checked={csvExportOptions.article_number}
                  onChange={(checked) => {
                    setCSVExportOptions({ ...csvExportOptions, article_number: checked });
                  }}
                />
              </Form.Item>
              <Form.Item label={t("filament.fields.comment")}>
                <Switch
                  checked={csvExportOptions.comment}
                  onChange={(checked) => {
                    setCSVExportOptions({ ...csvExportOptions, comment: checked });
                  }}
                />
              </Form.Item>
              <Form.Item label={t("filament.fields.settings_extruder_temp")}>
                <Switch
                  checked={csvExportOptions.settings_extruder_temp}
                  onChange={(checked) => {
                    setCSVExportOptions({ ...csvExportOptions, settings_extruder_temp: checked });
                  }}
                />
              </Form.Item>
              <Form.Item label={t("filament.fields.settings_bed_temp")}>
                <Switch
                  checked={csvExportOptions.settings_bed_temp}
                  onChange={(checked) => {
                    setCSVExportOptions({ ...csvExportOptions, settings_bed_temp: checked });
                  }}
                />
              </Form.Item>
              <Form.Item label={t("filament.fields.color_hex")}>
                <Switch
                  checked={csvExportOptions.color_hex}
                  onChange={(checked) => {
                    setCSVExportOptions({ ...csvExportOptions, color_hex: checked });
                  }}
                />
              </Form.Item>
            </Collapse.Panel>
            <Collapse.Panel header={t("exporting.generic.csvOptions.vendorFields")} key="3">
              <Form.Item label={t("vendor.fields.id")}>
                <Switch
                  checked={csvExportOptions.vendor?.id}
                  onChange={(checked) => {
                    const vendorOptions = { ...csvExportOptions.vendor, id: checked };
                    setCSVExportOptions({ ...csvExportOptions, vendor: vendorOptions });
                  }}
                />
              </Form.Item>
              <Form.Item label={t("vendor.fields.registered")}>
                <Switch
                  checked={csvExportOptions.vendor?.registered}
                  onChange={(checked) => {
                    const vendorOptions = { ...csvExportOptions.vendor, registered: checked };
                    setCSVExportOptions({ ...csvExportOptions, vendor: vendorOptions });
                  }}
                />
              </Form.Item>
              <Form.Item label={t("vendor.fields.name")}>
                <Switch
                  checked={csvExportOptions.vendor?.name}
                  onChange={(checked) => {
                    const vendorOptions = { ...csvExportOptions.vendor, name: checked };
                    setCSVExportOptions({ ...csvExportOptions, vendor: vendorOptions });
                  }}
                />
              </Form.Item>
              <Form.Item label={t("vendor.fields.comment")}>
                <Switch
                  checked={csvExportOptions.vendor?.comment}
                  onChange={(checked) => {
                    const vendorOptions = { ...csvExportOptions.vendor, comment: checked };
                    setCSVExportOptions({ ...csvExportOptions, vendor: vendorOptions });
                  }}
                />
              </Form.Item>
            </Collapse.Panel>
          </Collapse>
        </Col>
      </Col>
    </Modal>
  );
};

export default FilamentExportDialog;
