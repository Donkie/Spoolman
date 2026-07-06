import { CopyOutlined, DeleteOutlined, PlusOutlined, SaveOutlined } from "@ant-design/icons";
import { useTranslate } from "@refinedev/core";
import { Button, Flex, Form, Input, Modal, Popconfirm, Select, Table, Typography, message } from "antd";
import TextArea from "antd/es/input/TextArea";
import { useEffect, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { EntityType, useGetFields } from "../../utils/queryFields";
import { useGetSetting } from "../../utils/querySettings";
import { useSavedState } from "../../utils/saveload";
import { useGetFilamentsByIds } from "../filaments/functions";
import { IFilament } from "../filaments/model";
import {
  getConfiguredBaseUrl,
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
  const currentPresetType = "filament";
  const otherPresetType = "spool";
  const defaultPresetName = t("printing.generic.defaultSettings");
  const importedPresetSuffix = `(${otherPresetType} preset basis)`;
  const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const getNextPresetName = (baseName: string, presets: SpoolQRCodePrintSettings[]) => {
    const trimmedBaseName = baseName.trim() || defaultPresetName;
    const normalizedBaseName = trimmedBaseName.replace(/-\d{2}$/u, "");
    const suffixPattern = new RegExp(`^${escapeRegExp(normalizedBaseName)}-(\\d{2})$`, "u");
    let maxSuffix = 0;
    for (const preset of presets) {
      const presetName = (preset.labelSettings.printSettings?.name ?? "").trim();
      const match = presetName.match(suffixPattern);
      if (!match) continue;
      maxSuffix = Math.max(maxSuffix, Number.parseInt(match[1], 10));
    }
    return `${normalizedBaseName}-${String(maxSuffix + 1).padStart(2, "0")}`;
  };
  const buildNewPreset = (
    id: string,
    name: string,
    sourcePreset?: SpoolQRCodePrintSettings,
  ): SpoolQRCodePrintSettings => {
    const copiedSourcePrintSettings = sourcePreset?.labelSettings?.printSettings ?? {};
    return {
      ...sourcePreset,
      labelSettings: {
        ...sourcePreset?.labelSettings,
        printSettings: {
          ...copiedSourcePrintSettings,
          id,
          name,
        },
      },
    };
  };
  const toPresetValue = (type: "spool" | "filament", id: string) => `${type}:${id}`;
  const parsePresetValue = (value?: string): { type: "spool" | "filament"; id: string } | undefined => {
    if (!value) return undefined;
    const separatorIndex = value.indexOf(":");
    if (separatorIndex < 0) return { type: currentPresetType, id: value };
    const type = value.slice(0, separatorIndex);
    const id = value.slice(separatorIndex + 1);
    if ((type === currentPresetType || type === otherPresetType) && id) {
      return { type, id };
    }
    return undefined;
  };
  const baseUrlSetting = useGetSetting("base_url");
  // Accept both JSON-backed settings and legacy plain strings so old `base_url` values do not crash the dialog.
  const baseUrlRoot = getConfiguredBaseUrl(baseUrlSetting.data?.value, window.location.origin);
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

  const [localCurrentPresets, setLocalCurrentPresets] = useState<SpoolQRCodePrintSettings[] | undefined>();
  const remoteCurrentPresets = useGetPrintPresets("print_presets_filament");
  const remoteOtherPresets = useGetPrintPresets("print_presets");
  const setRemotePresets = useSetPrintPresets("print_presets_filament");

  const currentPresets = localCurrentPresets ?? remoteCurrentPresets;
  const otherPresets = remoteOtherPresets ?? [];

  const savePresetsRemote = async () => {
    if (!localCurrentPresets) return;
    await setRemotePresets(localCurrentPresets);
  };

  useEffect(() => {
    // Keep the saved local list active until the refetched settings catch up, otherwise the
    // selector can briefly fall back to the default preset immediately after save.
    if (!localCurrentPresets || !remoteCurrentPresets) return;
    if (JSON.stringify(localCurrentPresets) === JSON.stringify(remoteCurrentPresets)) {
      setLocalCurrentPresets(undefined);
    }
  }, [localCurrentPresets, remoteCurrentPresets]);

  const addNewPreset = () => {
    if (!currentPresets) return;
    const newId = uuidv4();
    const newPreset = buildNewPreset(newId, t("printing.generic.newSetting"));
    setLocalCurrentPresets([...currentPresets, newPreset]);
    setSelectedPresetState(toPresetValue(currentPresetType, newId));
    return newPreset;
  };
  const promotePresetToCurrentType = (preset: SpoolQRCodePrintSettings): SpoolQRCodePrintSettings | undefined => {
    if (!currentPresets) return;
    const baseName = (preset.labelSettings.printSettings?.name ?? defaultPresetName).trim() || defaultPresetName;
    const promotedName = getNextPresetName(`${baseName} ${importedPresetSuffix}`, currentPresets);
    const promotedPreset = buildNewPreset(uuidv4(), promotedName, preset);
    setLocalCurrentPresets([...currentPresets, promotedPreset]);
    setSelectedPresetState(toPresetValue(currentPresetType, promotedPreset.labelSettings.printSettings.id));
    return promotedPreset;
  };
  const duplicateCurrentPreset = () => {
    if (!currentPresets) return;
    const newPreset = {
      ...curPreset,
      labelSettings: { ...curPreset.labelSettings, printSettings: { ...curPreset.labelSettings.printSettings } },
    };
    newPreset.labelSettings.printSettings.id = uuidv4();
    setLocalCurrentPresets([...currentPresets, newPreset]);
    setSelectedPresetState(toPresetValue(currentPresetType, newPreset.labelSettings.printSettings.id));
  };
  const updateCurrentPreset = (newSettings: SpoolQRCodePrintSettings) => {
    if (!currentPresets) return;
    const parsed = parsePresetValue(selectedPresetState);
    if (!parsed || parsed.type !== currentPresetType) {
      promotePresetToCurrentType(newSettings);
      return;
    }
    setLocalCurrentPresets(
      currentPresets.map((presets) => (presets.labelSettings.printSettings.id === parsed.id ? newSettings : presets)),
    );
  };
  const deleteCurrentPreset = () => {
    if (!currentPresets) return;
    const parsed = parsePresetValue(selectedPresetState);
    if (!parsed || parsed.type !== currentPresetType) return;
    setLocalCurrentPresets(currentPresets.filter((qPreset) => qPreset.labelSettings.printSettings.id !== parsed.id));
    setSelectedPresetState(undefined);
  };

  let curPreset: SpoolQRCodePrintSettings;
  if (currentPresets === undefined) {
    curPreset = {
      labelSettings: {
        printSettings: {
          id: "TEMP",
          name: t("printing.generic.newSetting"),
        },
      },
    };
  } else {
    if (currentPresets.length === 0) {
      const newSetting = addNewPreset();
      if (!newSetting) {
        console.error("Error adding new setting, this should never happen");
        return;
      }
      currentPresets.push(newSetting);
      curPreset = newSetting;
    } else {
      const parsedSelectedPreset = parsePresetValue(selectedPresetState);
      if (!parsedSelectedPreset) {
        curPreset = currentPresets[0];
        setSelectedPresetState(toPresetValue(currentPresetType, currentPresets[0].labelSettings.printSettings.id));
      } else if (parsedSelectedPreset.type === otherPresetType) {
        curPreset = currentPresets[0];
        setSelectedPresetState(toPresetValue(currentPresetType, currentPresets[0].labelSettings.printSettings.id));
      } else {
        const foundSetting = currentPresets.find(
          (settings) => settings.labelSettings.printSettings.id === parsedSelectedPreset.id,
        );
        if (foundSetting) {
          curPreset = foundSetting;
        } else {
          curPreset = currentPresets[0];
          setSelectedPresetState(toPresetValue(currentPresetType, currentPresets[0].labelSettings.printSettings.id));
        }
      }
    }
  }

  const hasUnsavedChanges =
    localCurrentPresets !== undefined &&
    JSON.stringify(localCurrentPresets) !== JSON.stringify(remoteCurrentPresets ?? []);

  const [templateHelpOpen, setTemplateHelpOpen] = useState(false);
  const titleTemplate = curPreset.titleTemplate ?? `==**{name}**== {color_hex}`;
  const infoTemplate =
    curPreset.template ??
    `{material} ({article_number})
{Diameter: {diameter} mm}
{Weight: {weight} g}
{Spool Weight: {spool_weight} g}
{ET: {settings_extruder_temp} °C}
{BT: {settings_bed_temp} °C}
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
            <Form.Item label={t("printing.generic.filamentPrintPresets")}>
              <Flex gap={8}>
                <Select
                  value={
                    selectedPresetState
                      ? selectedPresetState.includes(":")
                        ? selectedPresetState
                        : toPresetValue(currentPresetType, selectedPresetState)
                      : undefined
                  }
                  onChange={(value) => {
                    const parsed = parsePresetValue(value);
                    if (!parsed) return;
                    if (parsed.type === otherPresetType) {
                      const sourcePreset = otherPresets.find(
                        (settings) => settings.labelSettings.printSettings.id === parsed.id,
                      );
                      if (sourcePreset) {
                        promotePresetToCurrentType(sourcePreset);
                      }
                      return;
                    }
                    setSelectedPresetState(value);
                  }}
                  options={
                    currentPresets
                      ? [
                          {
                            label: t("printing.generic.filamentPrintPresets"),
                            options: currentPresets.map((settings) => ({
                              label:
                                settings.labelSettings.printSettings?.name || t("printing.generic.defaultSettings"),
                              value: toPresetValue(currentPresetType, settings.labelSettings.printSettings.id),
                            })),
                          },
                          {
                            label: t("printing.generic.spoolPrintPresets"),
                            options: otherPresets.map((settings) => ({
                              label:
                                settings.labelSettings.printSettings?.name || t("printing.generic.defaultSettings"),
                              value: toPresetValue(otherPresetType, settings.labelSettings.printSettings.id),
                            })),
                          },
                        ]
                      : []
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
                {currentPresets && currentPresets.length > 1 && (
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
              <div style={{ minHeight: 22, paddingTop: 4 }}>
                {hasUnsavedChanges && <Text type="danger">Unsaved Preset Changes</Text>}
              </div>
            </Form.Item>
          </>
        }
        items={items.map((filament) => ({
          value: useHTTPUrl ? `${baseUrlRoot}/filament/show/${filament.id}` : `WEB+SPOOLMAN:F-${filament.id}`,
          amlName: `filament-${filament.id}`,
          vendor: filament.vendor,
          title: <>{renderLabelContents(titleTemplate, filament)}</>,
          label: <>{renderLabelContents(infoTemplate, filament)}</>,
          errorLevel: "H",
        }))}
        extraTitleSettings={
          <Form.Item
            label={t("printing.qrcode.titleTemplate")}
            tooltip={t("printing.qrcode.titleTemplateTooltipFilament")}
          >
            <TextArea
              value={titleTemplate}
              rows={4}
              onChange={(newValue) => {
                curPreset.titleTemplate = newValue.target.value;
                updateCurrentPreset(curPreset);
              }}
            />
          </Form.Item>
        }
        extraInfoSettings={
          <>
            <Form.Item label={t("printing.qrcode.infoTemplate")}>
              <TextArea
                value={infoTemplate}
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
              onClick={async () => {
                try {
                  await savePresetsRemote();
                  messageApi.success(t("notifications.saveSuccessful"));
                } catch (error) {
                  messageApi.error(error instanceof Error ? error.message : "Save failed");
                }
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
