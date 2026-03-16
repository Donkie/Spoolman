import { CopyOutlined, DeleteOutlined, PlusOutlined, SaveOutlined } from "@ant-design/icons";
import { useTranslate } from "@refinedev/core";
import { Button, Flex, Form, Input, Modal, Popconfirm, Select, Table, Typography, message } from "antd";
import TextArea from "antd/es/input/TextArea";
import { useEffect, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { EntityType, useGetFields } from "../../utils/queryFields";
import { useGetSetting } from "../../utils/querySettings";
import { useSavedState } from "../../utils/saveload";
import { useGetSpoolsByIds } from "../spools/functions";
import { ISpool } from "../spools/model";
import {
  getConfiguredBaseUrl,
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

const SpoolQRCodePrintingDialog = ({ spoolIds }: SpoolQRCodePrintingDialog) => {
  const t = useTranslate();
  const currentPresetType = "spool";
  const otherPresetType = "filament";
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
  const [useHTTPUrl, setUseHTTPUrl] = useSavedState("print-useHTTPUrl", false);

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
  const [localCurrentPresets, setLocalCurrentPresets] = useState<SpoolQRCodePrintSettings[] | undefined>();
  const remoteCurrentPresets = useGetPrintPresets();
  const remoteOtherPresets = useGetPrintPresets("print_presets_filament");
  const setRemotePresets = useSetPrintPresets();

  const currentPresets = localCurrentPresets ?? remoteCurrentPresets;
  const otherPresets = remoteOtherPresets ?? [];

  const savePresetsRemote = () => {
    if (!localCurrentPresets) return;
    setRemotePresets(localCurrentPresets);
  };

  useEffect(() => {
    // Keep the saved local list active until the refetched settings catch up, otherwise the
    // selector can briefly fall back to the default preset immediately after save.
    if (!localCurrentPresets || !remoteCurrentPresets) return;
    if (JSON.stringify(localCurrentPresets) === JSON.stringify(remoteCurrentPresets)) {
      setLocalCurrentPresets(undefined);
    }
  }, [localCurrentPresets, remoteCurrentPresets]);

  // Functions to update settings
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

  // Initialize presets
  let curPreset: SpoolQRCodePrintSettings;
  if (currentPresets === undefined) {
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
    if (currentPresets.length === 0) {
      // DB loaded, but no settings found, add a new one and select it
      const newSetting = addNewPreset();
      if (!newSetting) {
        console.error("Error adding new setting, this should never happen");
        return;
      }

      // Mutate the allPrintSettings list so that the rest of the UI will work fine
      currentPresets.push(newSetting);
      curPreset = newSetting;
    } else {
      const parsedSelectedPreset = parsePresetValue(selectedPresetState);
      if (!parsedSelectedPreset) {
        // No setting has been selected, select the first one
        curPreset = currentPresets[0];
        setSelectedPresetState(toPresetValue(currentPresetType, currentPresets[0].labelSettings.printSettings.id));
      } else if (parsedSelectedPreset.type === otherPresetType) {
        curPreset = currentPresets[0];
        setSelectedPresetState(toPresetValue(currentPresetType, currentPresets[0].labelSettings.printSettings.id));
      } else {
        // A setting has been selected, find it
        const foundSetting = currentPresets.find(
          (settings) => settings.labelSettings.printSettings.id === parsedSelectedPreset.id,
        );
        if (foundSetting) {
          curPreset = foundSetting;
        } else {
          // Selected setting not found, reset to first available preset.
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
  const titleTemplate = curPreset.titleTemplate ?? `==**{filament.name}**== {filament.color_hex}`;
  const infoTemplate =
    curPreset.template ??
    `{filament.material} ({filament.article_number})
Spool ID: #{id}
Spool Weight: {filament.spool_weight} g
{ET: {filament.settings_extruder_temp} °C}
{BT: {filament.settings_bed_temp} °C}
{Lot Nr: {lot_nr}}
{{comment}}
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
        baseUrlRoot={baseUrlRoot}
        useHTTPUrl={useHTTPUrl}
        setUseHTTPUrl={setUseHTTPUrl}
        previewValues={{
          default: "WEB+SPOOLMAN:S-{id}",
          url: `${baseUrlRoot}/spool/show/{id}`,
        }}
        extraSettingsStart={
          <>
            <Form.Item label={t("printing.generic.spoolPrintPresets")}>
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
                            label: t("printing.generic.spoolPrintPresets"),
                            options: currentPresets.map((settings) => ({
                              label:
                                settings.labelSettings.printSettings?.name || t("printing.generic.defaultSettings"),
                              value: toPresetValue(currentPresetType, settings.labelSettings.printSettings.id),
                            })),
                          },
                          {
                            label: t("printing.generic.filamentPrintPresets"),
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
        items={items.map((spool) => ({
          value: useHTTPUrl ? `${baseUrlRoot}/spool/show/${spool.id}` : `WEB+SPOOLMAN:S-${spool.id}`,
          amlName: `spool-${spool.id}`,
          vendor: spool.filament.vendor,
          title: <>{renderLabelContents(titleTemplate, spool)}</>,
          label: <>{renderLabelContents(infoTemplate, spool)}</>,
          errorLevel: "H",
        }))}
        extraTitleSettings={
          <Form.Item
            label={t("printing.qrcode.titleTemplate")}
            tooltip={t("printing.qrcode.titleTemplateTooltipSpool")}
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
