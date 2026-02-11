import { CopyOutlined, DeleteOutlined, PlusOutlined, SaveOutlined } from "@ant-design/icons";
import { useTranslate } from "@refinedev/core";
import { Button, Flex, Form, Input, Modal, Popconfirm, Select, Table, Typography, message } from "antd";
import TextArea from "antd/es/input/TextArea";
import { useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { EntityType, useGetFields } from "../../utils/queryFields";
import { useGetSetting } from "../../utils/querySettings";
import { useSavedState } from "../../utils/saveload";
import { useGetFilamentsByIds } from "../filaments/functions";
import { IFilament } from "../filaments/model";
import {
  SpoolQRCodePrintSettings,
  renderLabelContents,
  useGetPrintSettings as useGetPrintPresets,
  useSetPrintSettings as useSetPrintPresets,
} from "./printing";
import QRCodePrintingDialog from "./qrCodePrintingDialog";

const { Text } = Typography;

interface FilamentQRCodePrintingDialogProps {
  filamentIds: number[];
}

const FilamentQRCodePrintingDialog = ({ filamentIds }: FilamentQRCodePrintingDialogProps) => {
  const t = useTranslate();
  const baseUrlSetting = useGetSetting("base_url");
  const baseUrlRoot =
    baseUrlSetting.data?.value !== undefined && JSON.parse(baseUrlSetting.data?.value) !== ""
      ? JSON.parse(baseUrlSetting.data?.value)
      : window.location.origin;
  const [messageApi, contextHolder] = message.useMessage();
  const [useHTTPUrl, setUseHTTPUrl] = useSavedState("print-useHTTPUrl-filament", false);

  const itemQueries = useGetFilamentsByIds(filamentIds);
  const items = itemQueries
    .map((itemQuery) => {
      return itemQuery.data ?? null;
    })
    .filter((item) => item !== null) as IFilament[];

  const [selectedPresetState, setSelectedPresetState] = useSavedState<string | undefined>(
    "selectedPresetFilament",
    undefined,
  );

  const [localPresets, setLocalPresets] = useState<SpoolQRCodePrintSettings[] | undefined>();
  const remotePresets = useGetPrintPresets("print_presets_filament");
  const setRemotePresets = useSetPrintPresets("print_presets_filament");

  const localOrRemotePresets = localPresets ?? remotePresets;

  const savePresetsRemote = () => {
    if (!localPresets) return;
    setRemotePresets(localPresets);
  };

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
        presets.labelSettings.printSettings.id === newSettings.labelSettings.printSettings.id ? newSettings : presets,
      ),
    );
  };
  const deleteCurrentPreset = () => {
    if (!localOrRemotePresets) return;
    setLocalPresets(
      localOrRemotePresets.filter((qPreset) => qPreset.labelSettings.printSettings.id !== selectedPresetState),
    );
    setSelectedPresetState(undefined);
  };

  let curPreset: SpoolQRCodePrintSettings;
  if (localOrRemotePresets === undefined) {
    curPreset = {
      labelSettings: {
        printSettings: {
          id: "TEMP",
          name: t("printing.generic.newSetting"),
        },
      },
    };
  } else {
    if (localOrRemotePresets.length === 0) {
      const newSetting = addNewPreset();
      if (!newSetting) {
        console.error("Error adding new setting, this should never happen");
        return;
      }
      localOrRemotePresets.push(newSetting);
      curPreset = newSetting;
    } else {
      if (!selectedPresetState) {
        curPreset = localOrRemotePresets[0];
        setSelectedPresetState(localOrRemotePresets[0].labelSettings.printSettings.id);
      } else {
        const foundSetting = localOrRemotePresets.find(
          (settings) => settings.labelSettings.printSettings.id === selectedPresetState,
        );
        if (foundSetting) {
          curPreset = foundSetting;
        } else {
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
    `**{vendor.name} - {name}
#{id} - {material}**
{Diameter: {diameter} mm}
{Weight: {weight} g}
{Spool Weight: {spool_weight} g}
{ET: {settings_extruder_temp} °C}
{BT: {settings_bed_temp} °C}
{Article: {article_number}}
{{comment}}
{comment}
{vendor.comment}`;

  const filamentTags = [
    { tag: "id" },
    { tag: "registered" },
    { tag: "name" },
    { tag: "material" },
    { tag: "price" },
    { tag: "density" },
    { tag: "diameter" },
    { tag: "weight" },
    { tag: "spool_weight" },
    { tag: "article_number" },
    { tag: "comment" },
    { tag: "settings_extruder_temp" },
    { tag: "settings_bed_temp" },
    { tag: "color_hex" },
    { tag: "multi_color_hexes" },
    { tag: "multi_color_direction" },
    { tag: "external_id" },
  ];
  const filamentFields = useGetFields(EntityType.filament);
  if (filamentFields.data !== undefined) {
    filamentFields.data.forEach((field) => {
      filamentTags.push({ tag: `extra.${field.key}` });
    });
  }
  const vendorTags = [
    { tag: "vendor.id" },
    { tag: "vendor.registered" },
    { tag: "vendor.name" },
    { tag: "vendor.comment" },
    { tag: "vendor.empty_spool_weight" },
    { tag: "vendor.external_id" },
  ];
  const vendorFields = useGetFields(EntityType.vendor);
  if (vendorFields.data !== undefined) {
    vendorFields.data.forEach((field) => {
      vendorTags.push({ tag: `vendor.extra.${field.key}` });
    });
  }

  const templateTags = [...filamentTags, ...vendorTags];

  return (
    <>
      {contextHolder}
      <QRCodePrintingDialog
        printSettings={curPreset.labelSettings}
        setPrintSettings={(newSettings) => {
          curPreset.labelSettings = newSettings;
          updateCurrentPreset(curPreset);
        }}
        baseUrlRoot={baseUrlRoot}
        useHTTPUrl={useHTTPUrl}
        setUseHTTPUrl={setUseHTTPUrl}
        previewValues={{
          default: "WEB+SPOOLMAN:F-{id}",
          url: `${baseUrlRoot}/filament/show/{id}`,
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
        items={items.map((filament) => ({
          value: useHTTPUrl ? `${baseUrlRoot}/filament/show/${filament.id}` : `WEB+SPOOLMAN:F-${filament.id}`,
          amlName: `filament-${filament.id}`,
          label: (
            <p
              style={{
                padding: "1mm 1mm 1mm 0",
                margin: 0,
                whiteSpace: "pre-wrap",
              }}
            >
              {renderLabelContents(template, filament)}
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
              {t("printing.qrcode.templateHelpFilament")}{" "}
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

export default FilamentQRCodePrintingDialog;
