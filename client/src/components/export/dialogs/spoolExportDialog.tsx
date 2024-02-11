import { Col, Collapse, Form, Input, InputNumber, Modal, Radio, Switch } from "antd";
import { ISpool } from "../../../pages/spools/model";
import { useSavedState } from "../../../utils/saveload";
import { CSVExportOptions, QRExportOptions, exportAsCSV, exportQRCode } from "../functions";
import { useTranslate } from "@refinedev/core";
import { RadioChangeEvent } from "antd/lib";
import { numberFormatter, numberParser } from "../../../utils/parsing";

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
  const [csvDefaultCollapse, setCSVDefaultCollapse] = useSavedState<string[]>("export-collapseState-csv-spool", []);

  const [csvExportOptions, setCSVExportOptions] = useSavedState<CSVExportOptions<ISpool>>("export-CSVOptions-spool", {
    delimiter: ";",
    includeHeaders: true,
    filename: "Spool Export",
    id: true,
    location: true,
    remaining_length: true,
    used_length: true,
  });
  const [qrExportOptions, setQRExportOptions] = useSavedState<QRExportOptions>("export-qrOptions-spool", {
    boxSize: 32,
    padding: 2,
    useFullURL: false,
  });

  const transformSpoolToQRContent = (spool: ISpool) => {

    let content = `web+spoolman:s-${spool.id}`;

    if (qrExportOptions.useFullURL) {
      content = `${window.location.origin}/spool/show/${spool.id}`;
    }

    return {
      data: content,
      title: `QR-Spool: ${spool.id}`,
    };
  }

  const exportSpools = async () => {
    switch (exportType) {
      case 'CSV': {
        const formValid = await csvForm.validateFields();

        if (formValid.errorFields && formValid.errorFields.length > 0) {
          return;
        }

        console.log(csvExportOptions)
        exportAsCSV(items, csvExportOptions);
        break;
      }

      case 'QR-Code': {
        const formValid = await qrForm.validateFields();

        if (formValid.errorFields && formValid.errorFields.length > 0) {
          return;
        }

        exportQRCode(items.map(transformSpoolToQRContent), qrExportOptions);
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
                console.log(e.target.value);
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
              <Collapse.Panel header={t("exporting.generic.csvOptions.spoolFields")} key="1">
                <Form.Item label={t("spool.fields.id")}>
                  <Switch
                    checked={csvExportOptions.id}
                    onChange={(checked) => {
                      setCSVExportOptions({ ...csvExportOptions, id: checked });
                    }}
                  />
                </Form.Item>
                <Form.Item label={t("spool.fields.registered")}>
                  <Switch
                    checked={csvExportOptions.registered}
                    onChange={(checked) => {
                      setCSVExportOptions({ ...csvExportOptions, registered: checked });
                    }}
                  />
                </Form.Item>
                <Form.Item label={t("spool.fields.first_used")}>
                  <Switch
                    checked={csvExportOptions.first_used}
                    onChange={(checked) => {
                      setCSVExportOptions({ ...csvExportOptions, first_used: checked });
                    }}
                  />
                </Form.Item>
                <Form.Item label={t("spool.fields.last_used")}>
                  <Switch
                    checked={csvExportOptions.last_used}
                    onChange={(checked) => {
                      setCSVExportOptions({ ...csvExportOptions, last_used: checked });
                    }}
                  />
                </Form.Item>
                <Form.Item label={t("spool.fields.price")}>
                  <Switch
                    checked={csvExportOptions.price}
                    onChange={(checked) => {
                      setCSVExportOptions({ ...csvExportOptions, price: checked });
                    }}
                  />
                </Form.Item>
                <Form.Item label={t("spool.fields.remaining_weight")}>
                  <Switch
                    checked={csvExportOptions.remaining_weight}
                    onChange={(checked) => {
                      setCSVExportOptions({ ...csvExportOptions, remaining_weight: checked });
                    }}
                  />
                </Form.Item>
                <Form.Item label={t("spool.fields.used_weight")}>
                  <Switch
                    checked={csvExportOptions.used_weight}
                    onChange={(checked) => {
                      setCSVExportOptions({ ...csvExportOptions, used_weight: checked });
                    }}
                  />
                </Form.Item>
                <Form.Item label={t("spool.fields.remaining_weight")}>
                  <Switch
                    checked={csvExportOptions.remaining_length}
                    onChange={(checked) => {
                      setCSVExportOptions({ ...csvExportOptions, remaining_length: checked });
                    }}
                  />
                </Form.Item>
                <Form.Item label={t("spool.fields.used_length")}>
                  <Switch
                    checked={csvExportOptions.used_length}
                    onChange={(checked) => {
                      setCSVExportOptions({ ...csvExportOptions, used_length: checked });
                    }}
                  />
                </Form.Item>
                <Form.Item label={t("spool.fields.location")}>
                  <Switch
                    checked={csvExportOptions.location}
                    onChange={(checked) => {
                      setCSVExportOptions({ ...csvExportOptions, location: checked });
                    }}
                  />
                </Form.Item>
                <Form.Item label={t("spool.fields.lot_nr")}>
                  <Switch
                    checked={csvExportOptions.lot_nr}
                    onChange={(checked) => {
                      setCSVExportOptions({ ...csvExportOptions, lot_nr: checked });
                    }}
                  />
                </Form.Item>
                <Form.Item label={t("spool.fields.comment")}>
                  <Switch
                    checked={csvExportOptions.comment}
                    onChange={(checked) => {
                      setCSVExportOptions({ ...csvExportOptions, comment: checked });
                    }}
                  />
                </Form.Item>
                <Form.Item label={t("spool.fields.archived")}>
                  <Switch
                    checked={csvExportOptions.archived}
                    onChange={(checked) => {
                      setCSVExportOptions({ ...csvExportOptions, archived: checked });
                    }}
                  />
                </Form.Item>
              </Collapse.Panel>
              <Collapse.Panel header={t("exporting.generic.csvOptions.filamentFields")} key="2">
                <Form.Item label={t("filament.fields.id")}>
                  <Switch
                    checked={csvExportOptions.filament?.id}
                    onChange={(checked) => {
                      const filamentOptions = { ...csvExportOptions.filament, id: checked };

                      setCSVExportOptions({ ...csvExportOptions, filament: filamentOptions });
                    }}
                  />
                </Form.Item>
                <Form.Item label={t("filament.fields.registered")}>
                  <Switch
                    checked={csvExportOptions.filament?.registered}
                    onChange={(checked) => {
                      const filamentOptions = { ...csvExportOptions.filament, registered: checked };

                      setCSVExportOptions({ ...csvExportOptions, filament: filamentOptions });
                    }}
                  />
                </Form.Item>
                <Form.Item label={t("filament.fields.name")}>
                  <Switch
                    checked={csvExportOptions.filament?.name}
                    onChange={(checked) => {
                      const filamentOptions = { ...csvExportOptions.filament, name: checked };

                      setCSVExportOptions({ ...csvExportOptions, filament: filamentOptions });
                    }}
                  />
                </Form.Item>
                <Form.Item label={t("filament.fields.material")}>
                  <Switch
                    checked={csvExportOptions.filament?.material}
                    onChange={(checked) => {
                      const filamentOptions = { ...csvExportOptions.filament, material: checked };

                      setCSVExportOptions({ ...csvExportOptions, filament: filamentOptions });
                    }}
                  />
                </Form.Item>
                <Form.Item label={t("filament.fields.price")}>
                  <Switch
                    checked={csvExportOptions.filament?.price}
                    onChange={(checked) => {
                      const filamentOptions = { ...csvExportOptions.filament, price: checked };

                      setCSVExportOptions({ ...csvExportOptions, filament: filamentOptions });
                    }}
                  />
                </Form.Item>
                <Form.Item label={t("filament.fields.density")}>
                  <Switch
                    checked={csvExportOptions.filament?.density}
                    onChange={(checked) => {
                      const filamentOptions = { ...csvExportOptions.filament, density: checked };

                      setCSVExportOptions({ ...csvExportOptions, filament: filamentOptions });
                    }}
                  />
                </Form.Item>
                <Form.Item label={t("filament.fields.diameter")}>
                  <Switch
                    checked={csvExportOptions.filament?.diameter}
                    onChange={(checked) => {
                      const filamentOptions = { ...csvExportOptions.filament, diameter: checked };

                      setCSVExportOptions({ ...csvExportOptions, filament: filamentOptions });
                    }}
                  />
                </Form.Item>
                <Form.Item label={t("filament.fields.weight")}>
                  <Switch
                    checked={csvExportOptions.filament?.weight}
                    onChange={(checked) => {
                      const filamentOptions = { ...csvExportOptions.filament, weight: checked };

                      setCSVExportOptions({ ...csvExportOptions, filament: filamentOptions });
                    }}
                  />
                </Form.Item>
                <Form.Item label={t("filament.fields.spool_weight")}>
                  <Switch
                    checked={csvExportOptions.filament?.spool_weight}
                    onChange={(checked) => {
                      const filamentOptions = { ...csvExportOptions.filament, spool_weight: checked };

                      setCSVExportOptions({ ...csvExportOptions, filament: filamentOptions });
                    }}
                  />
                </Form.Item>
                <Form.Item label={t("filament.fields.article_number")}>
                  <Switch
                    checked={csvExportOptions.filament?.article_number}
                    onChange={(checked) => {
                      const filamentOptions = { ...csvExportOptions.filament, article_number: checked };

                      setCSVExportOptions({ ...csvExportOptions, filament: filamentOptions });
                    }}
                  />
                </Form.Item>
                <Form.Item label={t("filament.fields.comment")}>
                  <Switch
                    checked={csvExportOptions.filament?.comment}
                    onChange={(checked) => {
                      const filamentOptions = { ...csvExportOptions.filament, comment: checked };

                      setCSVExportOptions({ ...csvExportOptions, filament: filamentOptions });
                    }}
                  />
                </Form.Item>
                <Form.Item label={t("filament.fields.settings_extruder_temp")}>
                  <Switch
                    checked={csvExportOptions.filament?.settings_extruder_temp}
                    onChange={(checked) => {
                      const filamentOptions = { ...csvExportOptions.filament, settings_extruder_temp: checked };

                      setCSVExportOptions({ ...csvExportOptions, filament: filamentOptions });
                    }}
                  />
                </Form.Item>
                <Form.Item label={t("filament.fields.settings_bed_temp")}>
                  <Switch
                    checked={csvExportOptions.filament?.settings_bed_temp}
                    onChange={(checked) => {
                      const filamentOptions = { ...csvExportOptions.filament, settings_bed_temp: checked };

                      setCSVExportOptions({ ...csvExportOptions, filament: filamentOptions });
                    }}
                  />
                </Form.Item>
                <Form.Item label={t("filament.fields.color_hex")}>
                  <Switch
                    checked={csvExportOptions.filament?.color_hex}
                    onChange={(checked) => {
                      const filamentOptions = { ...csvExportOptions.filament, color_hex: checked };

                      setCSVExportOptions({ ...csvExportOptions, filament: filamentOptions });
                    }}
                  />
                </Form.Item>
              </Collapse.Panel>
              <Collapse.Panel header={t("exporting.generic.csvOptions.vendorFields")} key="3">
                <Form.Item label={t("vendor.fields.id")}>
                  <Switch
                    checked={csvExportOptions.filament?.vendor?.id}
                    onChange={(checked) => {
                      const vendorOptions = { ...csvExportOptions.filament?.vendor, id: checked };
                      const filamentOptions = { ...csvExportOptions.filament, vendor: vendorOptions };

                      setCSVExportOptions({ ...csvExportOptions, filament: filamentOptions });
                    }}
                  />
                </Form.Item>
                <Form.Item label={t("vendor.fields.registered")}>
                  <Switch
                    checked={csvExportOptions.filament?.vendor?.registered}
                    onChange={(checked) => {
                      const vendorOptions = { ...csvExportOptions.filament?.vendor, registered: checked };
                      const filamentOptions = { ...csvExportOptions.filament, vendor: vendorOptions };

                      setCSVExportOptions({ ...csvExportOptions, filament: filamentOptions });
                    }}
                  />
                </Form.Item>
                <Form.Item label={t("vendor.fields.name")}>
                  <Switch
                    checked={csvExportOptions.filament?.vendor?.name}
                    onChange={(checked) => {
                      const vendorOptions = { ...csvExportOptions.filament?.vendor, name: checked };
                      const filamentOptions = { ...csvExportOptions.filament, vendor: vendorOptions };

                      setCSVExportOptions({ ...csvExportOptions, filament: filamentOptions });
                    }}
                  />
                </Form.Item>
                <Form.Item label={t("vendor.fields.comment")}>
                  <Switch
                    checked={csvExportOptions.filament?.vendor?.comment}
                    onChange={(checked) => {
                      const vendorOptions = { ...csvExportOptions.filament?.vendor, comment: checked };
                      const filamentOptions = { ...csvExportOptions.filament, vendor: vendorOptions };

                      setCSVExportOptions({ ...csvExportOptions, filament: filamentOptions });
                    }}
                  />
                </Form.Item>
              </Collapse.Panel>
            </Collapse>
          </Form>
        </Col>
      </Col>
    </Modal>
  );
};

export default SpoolExportDialog;
