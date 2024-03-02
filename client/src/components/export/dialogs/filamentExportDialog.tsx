import { Cascader, Col, Collapse, Form, Input, Modal, Switch, Tag, Typography } from "antd";
import { IFilament, IFilamentEportableKeys } from "../../../pages/filaments/model";
import { useSavedState } from "../../../utils/saveload";
import { useTranslate } from "@refinedev/core";
import { CSVExportConfig, CSVExportOptions, exportAsCSV } from "../../../utils/csvGeneration";

const { SHOW_CHILD } = Cascader;

interface FilamentExportDialog {
  visible: boolean;
  items: IFilament[];
  onCancel: () => void;
}

const FilamentExportDialog: React.FC<FilamentExportDialog> = ({ visible, items, onCancel }) => {
  const t = useTranslate();
  const [csvExportOptions, setCSVExportOptions] = useSavedState<CSVExportConfig>("export-CSVOptions-filament", {
    delimiter: ";",
    includeHeaders: true,
    filename: "Filament Export",
  });

  const [exportField, setExportField] = useSavedState<(string | number)[][]>("export-filament-exportField", [["id"]]);

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
          <Typography.Title level={5}>{t('exporting.generic.csvOptions.fieldToExport')}</Typography.Title>
            <Cascader
              defaultValue={exportField}
              onChange={(value) => {
                setExportField(value);
              }}
              multiple
              style={{ width: '100%' }}
              options={IFilamentEportableKeys(t)}
            />
        </Col>
      </Col>
    </Modal>
  );
};

export default FilamentExportDialog;
