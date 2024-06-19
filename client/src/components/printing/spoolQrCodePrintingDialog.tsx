import { Button, Flex, Form, Input, Modal, Popconfirm, Select, Space, Switch, Table, Typography } from "antd";
import { IFilament } from "../../pages/filaments/model";
import { ISpool } from "../../pages/spools/model";
import QRCodePrintingDialog from "./qrCodePrintingDialog";
import { useSavedState } from "../../utils/saveload";
import { useTranslate } from "@refinedev/core";
import {
  QRCodePrintSettings,
  SpoolQRCodePrintSettings,
  renderLabelContents,
  useGetPrintSettings,
  useSetPrintSettings,
} from "./printing";
import { useMemo, useState } from "react";
import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { v4 as uuidv4 } from "uuid";
import _ from "lodash";
import TextArea from "antd/es/input/TextArea";
import { EntityType, useGetFields } from "../../utils/queryFields";

const { Text } = Typography;

interface SpoolQRCodePrintingDialog {
  visible: boolean;
  items: ISpool[];
  onCancel: () => void;
}

const SpoolQRCodePrintingDialog: React.FC<SpoolQRCodePrintingDialog> = ({ visible, items, onCancel }) => {
  const t = useTranslate();

  // Selected setting state
  const [selectedSetting, setSelectedSetting] = useState<string | undefined>();

  // Keep a local copy of the settings which is what's actually displayed. Use the remote state only for saving.
  // This decouples the debounce stuff from the UI
  const [localSettings, setLocalSettings] = useState<SpoolQRCodePrintSettings[] | undefined>();
  const remoteSettings = useGetPrintSettings();
  const setRemoteSettings = useSetPrintSettings();
  const debouncedSetRemoteSettings = useMemo(() => _.debounce(setRemoteSettings, 500), []);

  const allPrintSettings = localSettings ?? remoteSettings;
  const setPrintSettings = (newSettings: SpoolQRCodePrintSettings[]) => {
    setLocalSettings(newSettings);
    debouncedSetRemoteSettings(newSettings);
  };

  // Functions to update settings
  const addNewPrintSettings = () => {
    if (!allPrintSettings) return;
    const newId = uuidv4();
    const newSetting = {
      labelSettings: {
        printSettings: {
          id: newId,
          name: t("printing.generic.newSetting"),
        },
      },
    };
    setPrintSettings([...allPrintSettings, newSetting]);
    setSelectedSetting(newId);
    return newSetting;
  };
  const updateCurrentPrintSettings = (newSettings: SpoolQRCodePrintSettings) => {
    if (!allPrintSettings) return;
    setPrintSettings(
      allPrintSettings.map((settings) =>
        settings.labelSettings.printSettings.id === newSettings.labelSettings.printSettings.id ? newSettings : settings
      )
    );
  };
  const deleteCurrentPrintSettings = () => {
    if (!allPrintSettings) return;
    setPrintSettings(
      allPrintSettings.filter((qSetting) => qSetting.labelSettings.printSettings.id !== selectedSetting)
    );
    setSelectedSetting(undefined);
  };

  // Initialize settings
  let selectedPrintSetting: SpoolQRCodePrintSettings;
  if (allPrintSettings === undefined) {
    // DB not loaded yet, use a temporary one
    selectedPrintSetting = {
      labelSettings: {
        printSettings: {
          id: "TEMP",
          name: t("printing.generic.newSetting"),
        },
      },
    };
  } else {
    // DB is loaded, find the selected setting
    if (allPrintSettings.length === 0) {
      // DB loaded, but no settings found, add a new one and select it
      const newSetting = addNewPrintSettings();
      if (!newSetting) {
        console.error("Error adding new setting, this should never happen");
        return;
      }

      // Mutate the allPrintSettings list so that the rest of the UI will work fine
      allPrintSettings.push(newSetting);
      selectedPrintSetting = newSetting;
    } else {
      // DB loaded and at least 1 setting exists
      if (!selectedSetting) {
        // No setting has been selected, select the first one
        selectedPrintSetting = allPrintSettings[0];
        setSelectedSetting(allPrintSettings[0].labelSettings.printSettings.id);
      } else {
        // A setting has been selected, find it
        const foundSetting = allPrintSettings.find(
          (settings) => settings.labelSettings.printSettings.id === selectedSetting
        );
        if (foundSetting) {
          selectedPrintSetting = foundSetting;
        } else {
          // Selected setting not found, select a temp one
          selectedPrintSetting = {
            labelSettings: {
              printSettings: {
                id: "TEMP",
                name: t("printing.generic.newSetting"),
              },
            },
          };
        }
      }
    }
  }

  const [templateHelpOpen, setTemplateHelpOpen] = useState(false);
  const template = selectedPrintSetting.template ?? "";

  const spoolTags = [
    { tag: "id" },
    { tag: "registered" },
    { tag: "first_used" },
    { tag: "last_used" },
    { tag: "price" },
    { tag: "initial_weight" },
    { tag: "spool_weight" },
    { tag: "remaining_weight" },
    { tag: "used_weight" },
    { tag: "remaining_length" },
    { tag: "used_length" },
    { tag: "location" },
    { tag: "lot_nr" },
    { tag: "comment" },
    { tag: "archived" },
  ];
  const spoolFields = useGetFields(EntityType.spool);
  if (spoolFields.data !== undefined) {
    spoolFields.data.forEach((field) => {
      spoolTags.push({ tag: `extra.${field.key}` });
    });
  }
  const filamentTags = [
    { tag: "filament.id" },
    { tag: "filament.registered" },
    { tag: "filament.name" },
    { tag: "filament.material" },
    { tag: "filament.price" },
    { tag: "filament.density" },
    { tag: "filament.diameter" },
    { tag: "filament.weight" },
    { tag: "filament.spool_weight" },
    { tag: "filament.article_number" },
    { tag: "filament.comment" },
    { tag: "filament.settings_extruder_temp" },
    { tag: "filament.settings_bed_temp" },
    { tag: "filament.color_hex" },
    { tag: "filament.multi_color_hexes" },
    { tag: "filament.multi_color_direction" },
    { tag: "filament.external_id" },
  ];
  const filamentFields = useGetFields(EntityType.filament);
  if (filamentFields.data !== undefined) {
    filamentFields.data.forEach((field) => {
      filamentTags.push({ tag: `filament.extra.${field.key}` });
    });
  }
  const vendorTags = [
    { tag: "filament.vendor.id" },
    { tag: "filament.vendor.registered" },
    { tag: "filament.vendor.name" },
    { tag: "filament.vendor.comment" },
    { tag: "filament.vendor.empty_spool_weight" },
    { tag: "filament.vendor.external_id" },
  ];
  const vendorFields = useGetFields(EntityType.vendor);
  if (vendorFields.data !== undefined) {
    vendorFields.data.forEach((field) => {
      vendorTags.push({ tag: `filament.vendor.extra.${field.key}` });
    });
  }

  const templateTags = [...spoolTags, ...filamentTags, ...vendorTags];

  return (
    <QRCodePrintingDialog
      visible={visible}
      onCancel={onCancel}
      printSettings={selectedPrintSetting.labelSettings}
      setPrintSettings={(newSettings) => {
        selectedPrintSetting.labelSettings = newSettings;
        updateCurrentPrintSettings(selectedPrintSetting);
      }}
      extraSettingsStart={
        <>
          <Form.Item label={t("printing.generic.settings")}>
            <Flex gap={8}>
              <Select
                value={selectedSetting}
                onChange={(value) => {
                  setSelectedSetting(value);
                }}
                options={
                  allPrintSettings &&
                  allPrintSettings.map((settings) => ({
                    label: settings.labelSettings.printSettings?.name || t("printing.generic.defaultSettings"),
                    value: settings.labelSettings.printSettings.id,
                  }))
                }
              ></Select>
              <Button
                style={{ width: "3em" }}
                icon={<PlusOutlined />}
                title={t("printing.generic.addSettings")}
                onClick={addNewPrintSettings}
              />
              {allPrintSettings && allPrintSettings.length > 1 && (
                <Popconfirm
                  title={t("printing.generic.deleteSettings")}
                  description={t("printing.generic.deleteSettingsConfirm")}
                  onConfirm={deleteCurrentPrintSettings}
                  okText={t("buttons.delete")}
                  cancelText={t("buttons.cancel")}
                >
                  <Button
                    style={{ width: "3em" }}
                    danger
                    icon={<DeleteOutlined />}
                    title={t("printing.generic.deleteSettings")}
                  />
                </Popconfirm>
              )}
            </Flex>
          </Form.Item>
          <Form.Item label={t("printing.generic.settingsName")}>
            <Input
              value={selectedPrintSetting.labelSettings.printSettings?.name}
              onChange={(e) => {
                selectedPrintSetting.labelSettings.printSettings.name = e.target.value;
                updateCurrentPrintSettings(selectedPrintSetting);
              }}
            />
          </Form.Item>
        </>
      }
      items={items.map(function (spool) {
        return {
          value: `web+spoolman:s-${spool.id}`,
          label: (
            <p
              style={{
                padding: "1mm 1mm 1mm 0",
                whiteSpace: "pre-wrap",
              }}
            >
              {renderLabelContents(template, spool)}
            </p>
          ),
          errorLevel: "H",
        };
      })}
      extraSettings={
        <>
          <Form.Item label={t("printing.qrcode.template")}>
            <TextArea
              value={template}
              rows={8}
              onChange={(newValue) => {
                selectedPrintSetting.template = newValue.target.value;
                updateCurrentPrintSettings(selectedPrintSetting);
              }}
            />
          </Form.Item>
          <Modal open={templateHelpOpen} footer={null} onCancel={() => setTemplateHelpOpen(false)}>
            <Table
              size="small"
              showHeader={false}
              pagination={false}
              scroll={{ y: 400 }}
              columns={[{ dataIndex: "tag" }]}
              dataSource={templateTags}
            />
          </Modal>
          <Text type="secondary">
            {t("printing.qrcode.templateHelp")}{" "}
            <Button size="small" onClick={() => setTemplateHelpOpen(true)}>
              {t("actions.show")}
            </Button>
          </Text>
        </>
      }
    />
  );
};

export default SpoolQRCodePrintingDialog;
