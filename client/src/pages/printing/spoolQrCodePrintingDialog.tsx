import { CopyOutlined, DeleteOutlined, PlusOutlined, SaveOutlined } from "@ant-design/icons";
import { useGetSetting } from "../../utils/querySettings";
import { useTranslate } from "@refinedev/core";
import { Button, Flex, Form, Input, Modal, Popconfirm, Select, Table, Typography, message, Switch } from "antd";
import TextArea from "antd/es/input/TextArea";
import { useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { EntityType, useGetFields } from "../../utils/queryFields";
import { useSavedState } from "../../utils/saveload";
import { useGetSpoolsByIds } from "../spools/functions";
import { ISpool } from "../spools/model";
import {
  SpoolQRCodePrintSettings,
  renderLabelContents,
  useGetPrintSettings as useGetPrintPresets,
  useSetPrintSettings as useSetPrintPresets,
} from "./printing";
import QRCodePrintingDialog from "./qrCodePrintingDialog";

const { Text } = Typography;

interface SpoolQRCodePrintingDialog {
  spoolIds: number[];
}

const SpoolQRCodePrintingDialog: React.FC<SpoolQRCodePrintingDialog> = ({ spoolIds }) => {
  const t = useTranslate();
  const baseUrlSetting = useGetSetting("base_url");
  const baseUrlRoot =
    baseUrlSetting.data?.value !== undefined && JSON.parse(baseUrlSetting.data?.value) !== ""
      ? JSON.parse(baseUrlSetting.data?.value)
      : window.location.origin;
  const [messageApi, contextHolder] = message.useMessage();
  const [useHTTPUrl, setUseHTTPUrl] = useSavedState("print-useHTTPUrl", baseUrlSetting.data?.value !== "");

  const itemQueries = useGetSpoolsByIds(spoolIds);
  const items = itemQueries
    .map((itemQuery) => {
      return itemQuery.data ?? null;
    })
    .filter((item) => item !== null) as ISpool[];

  // Selected preset state
  const [selectedPresetState, setSelectedPresetState] = useSavedState<string | undefined>("selectedPreset", undefined);

  // Keep a local copy of the settings which is what's actually displayed. Use the remote state only for saving.
  // This decouples the debounce stuff from the UI
  const [localPresets, setLocalPresets] = useState<SpoolQRCodePrintSettings[] | undefined>();
  const remotePresets = useGetPrintPresets();
  const setRemotePresets = useSetPrintPresets();

  const localOrRemotePresets = localPresets ?? remotePresets;

  const savePresetsRemote = () => {
    if (!localPresets) return;
    setRemotePresets(localPresets);
  };

  // Functions to update settings
  const addNewPreset = () => {
    if (!localOrRemotePresets) return;
    const newId = uuidv4();
    const newPreset = {
      labelSettings: {
        printSettings: {
          id: newId,
          name: t("printing.generic.newSetting"),
        },
      },
    };
    setLocalPresets([...localOrRemotePresets, newPreset]);
    setSelectedPresetState(newId);
    return newPreset;
  };
  const duplicateCurrentPreset = () => {
    if (!localOrRemotePresets) return;
    const newPreset = {
      ...curPreset,
      labelSettings: { ...curPreset.labelSettings, printSettings: { ...curPreset.labelSettings.printSettings } },
    };
    newPreset.labelSettings.printSettings.id = uuidv4();
    setLocalPresets([...localOrRemotePresets, newPreset]);
    setSelectedPresetState(newPreset.labelSettings.printSettings.id);
  };
  const updateCurrentPreset = (newSettings: SpoolQRCodePrintSettings) => {
    if (!localOrRemotePresets) return;
    setLocalPresets(
      localOrRemotePresets.map((presets) =>
        presets.labelSettings.printSettings.id === newSettings.labelSettings.printSettings.id ? newSettings : presets
      )
    );
  };
  const deleteCurrentPreset = () => {
    if (!localOrRemotePresets) return;
    setLocalPresets(
      localOrRemotePresets.filter((qPreset) => qPreset.labelSettings.printSettings.id !== selectedPresetState)
    );
    setSelectedPresetState(undefined);
  };

  // Initialize presets
  let curPreset: SpoolQRCodePrintSettings;
  if (localOrRemotePresets === undefined) {
    // DB not loaded yet, use a temporary one
    curPreset = {
      labelSettings: {
        printSettings: {
          id: "TEMP",
          name: t("printing.generic.newSetting"),
        },
      },
    };
  } else {
    // DB is loaded, find the selected setting
    if (localOrRemotePresets.length === 0) {
      // DB loaded, but no settings found, add a new one and select it
      const newSetting = addNewPreset();
      if (!newSetting) {
        console.error("Error adding new setting, this should never happen");
        return;
      }

      // Mutate the allPrintSettings list so that the rest of the UI will work fine
      localOrRemotePresets.push(newSetting);
      curPreset = newSetting;
    } else {
      // DB loaded and at least 1 setting exists
      if (!selectedPresetState) {
        // No setting has been selected, select the first one
        curPreset = localOrRemotePresets[0];
        setSelectedPresetState(localOrRemotePresets[0].labelSettings.printSettings.id);
      } else {
        // A setting has been selected, find it
        const foundSetting = localOrRemotePresets.find(
          (settings) => settings.labelSettings.printSettings.id === selectedPresetState
        );
        if (foundSetting) {
          curPreset = foundSetting;
        } else {
          // Selected setting not found, select a temp one
          curPreset = {
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
  const template =
    curPreset.template ??
    `**{filament.vendor.name} - {filament.name}
#{id} - {filament.material}**
Spool Weight: {filament.spool_weight} g
ET: {filament.settings_extruder_temp} °C
BT: {filament.settings_bed_temp} °C
Lot Nr: {lot_nr}
{comment}
{filament.comment}
{filament.vendor.comment}`;

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
    <>
      {contextHolder}
      <QRCodePrintingDialog
        printSettings={curPreset.labelSettings}
        setPrintSettings={(newSettings) => {
          curPreset.labelSettings = newSettings;
          updateCurrentPreset(curPreset);
        }}
        extraSettingsStart={
          <>
            <Form.Item label={t("printing.generic.settings")}>
              <Flex gap={8}>
                <Select
                  value={selectedPresetState}
                  onChange={(value) => {
                    setSelectedPresetState(value);
                  }}
                  options={
                    localOrRemotePresets &&
                    localOrRemotePresets.map((settings) => ({
                      label: settings.labelSettings.printSettings?.name || t("printing.generic.defaultSettings"),
                      value: settings.labelSettings.printSettings.id,
                    }))
                  }
                ></Select>
                <Button
                  style={{ width: "3em" }}
                  icon={<PlusOutlined />}
                  title={t("printing.generic.addSettings")}
                  onClick={addNewPreset}
                />
                <Button
                  style={{ width: "3em" }}
                  icon={<CopyOutlined />}
                  title={t("printing.generic.duplicateSettings")}
                  onClick={duplicateCurrentPreset}
                />
                {localOrRemotePresets && localOrRemotePresets.length > 1 && (
                  <Popconfirm
                    title={t("printing.generic.deleteSettings")}
                    description={t("printing.generic.deleteSettingsConfirm")}
                    onConfirm={deleteCurrentPreset}
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
                value={curPreset.labelSettings.printSettings?.name}
                onChange={(e) => {
                  curPreset.labelSettings.printSettings.name = e.target.value;
                  updateCurrentPreset(curPreset);
                }}
              />
            </Form.Item>
          </>
        }
        items={items.map((spool) => ({
          value: useHTTPUrl ? `${baseUrlRoot}/spool/show/${spool.id}` : `web+spoolman:s-${spool.id}`,
          label: (
            <p
              style={{
                padding: "1mm 1mm 1mm 0",
                margin: 0,
                whiteSpace: "pre-wrap",
              }}
            >
              {renderLabelContents(template, spool)}
            </p>
          ),
          errorLevel: "H",
        }))}
        extraSettings={
          <>
            <Form.Item label={t("printing.qrcode.template")}>
              <TextArea
                value={template}
                rows={8}
                onChange={(newValue) => {
                  curPreset.template = newValue.target.value;
                  updateCurrentPreset(curPreset);
                }}
              />
            </Form.Item>
            <Form.Item label={t("printing.qrcode.useHTTPUrl.label")} tooltip={t("printing.qrcode.useHTTPUrl.tooltip")}>
              <Switch checked={useHTTPUrl} onChange={(checked) => setUseHTTPUrl(checked)} />
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
        extraButtons={
          <>
            <Button
              type="primary"
              size="large"
              icon={<SaveOutlined />}
              onClick={() => {
                savePresetsRemote();
                messageApi.success(t("notifications.saveSuccessful"));
              }}
            >
              {t("printing.generic.saveSetting")}
            </Button>
          </>
        }
      />
    </>
  );
};

export default SpoolQRCodePrintingDialog;
