import { CopyOutlined, DeleteOutlined, PlusOutlined, SaveOutlined } from "@ant-design/icons";
import { useTranslate } from "@refinedev/core";
import { Button, Flex, Form, Input, Modal, Popconfirm, Select, Table, Typography, message } from "antd";
import TextArea from "antd/es/input/TextArea";
import { useEffect, useMemo, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { EntityType, useGetFields } from "../../utils/queryFields";
import { useGetSetting } from "../../utils/querySettings";
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

function clonePreset(preset: SpoolQRCodePrintSettings): SpoolQRCodePrintSettings {
  return JSON.parse(JSON.stringify(preset)) as SpoolQRCodePrintSettings;
}

function clonePresets(presets: SpoolQRCodePrintSettings[]): SpoolQRCodePrintSettings[] {
  return presets.map(clonePreset);
}

function buildNewPreset(name: string): SpoolQRCodePrintSettings {
  const newId = uuidv4();
  return {
    labelSettings: {
      printSettings: {
        id: newId,
        name,
      },
    },
  };
}

const SpoolQRCodePrintingDialog = ({ spoolIds }: SpoolQRCodePrintingDialog) => {
  const t = useTranslate();
  const baseUrlSetting = useGetSetting("base_url");
  const baseUrlRoot =
    baseUrlSetting.data?.value !== undefined && JSON.parse(baseUrlSetting.data?.value) !== ""
      ? JSON.parse(baseUrlSetting.data?.value)
      : window.location.origin;
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
  const [localPresets, setLocalPresets] = useState<SpoolQRCodePrintSettings[] | undefined>();
  const [draftPreset, setDraftPreset] = useState<SpoolQRCodePrintSettings | undefined>();
  const remotePresets = useGetPrintPresets();
  const setRemotePresets = useSetPrintPresets();
  const [emptyPresetBaseline] = useState<SpoolQRCodePrintSettings>(() =>
    buildNewPreset(t("printing.generic.newSetting")),
  );

  const localOrRemotePresets = localPresets ?? remotePresets;
  const hasPersistedPresets = (localOrRemotePresets?.length ?? 0) > 0;

  const remotePresetsComparable = useMemo(() => JSON.stringify(remotePresets ?? []), [remotePresets]);
  const localPresetsComparable = useMemo(
    () => JSON.stringify(localPresets ?? remotePresets ?? []),
    [localPresets, remotePresets],
  );
  const draftPresetComparable = useMemo(
    () => JSON.stringify(draftPreset ?? emptyPresetBaseline),
    [draftPreset, emptyPresetBaseline],
  );
  const emptyPresetBaselineComparable = useMemo(() => JSON.stringify(emptyPresetBaseline), [emptyPresetBaseline]);
  const hasUnsavedPresetChanges =
    (localPresets !== undefined && localPresetsComparable !== remotePresetsComparable) ||
    (!hasPersistedPresets && draftPreset !== undefined && draftPresetComparable !== emptyPresetBaselineComparable);

  const savePresetsRemote = async (): Promise<boolean> => {
    if (!hasUnsavedPresetChanges) return false;
    // Only persist when the local working copy diverges from the remote source; this
    // keeps the Save Preset button as a true "needs action" indicator.
    if (localPresets) {
      await setRemotePresets.mutateAsync(localPresets);
      setLocalPresets(undefined);
      return true;
    }
    if (!hasPersistedPresets && draftPreset) {
      await setRemotePresets.mutateAsync([draftPreset]);
      setDraftPreset(undefined);
      return true;
    }
    return false;
  };

  const updatePresetById = (
    presetId: string,
    updater: (preset: SpoolQRCodePrintSettings) => SpoolQRCodePrintSettings,
  ) => {
    if (!localOrRemotePresets) return;
    setLocalPresets(
      localOrRemotePresets.map((preset) =>
        preset.labelSettings.printSettings.id === presetId ? updater(clonePreset(preset)) : clonePreset(preset),
      ),
    );
  };

  const updateCurrentPreset = (updater: (preset: SpoolQRCodePrintSettings) => SpoolQRCodePrintSettings) => {
    if (hasPersistedPresets) {
      updatePresetById(curPreset.labelSettings.printSettings.id, updater);
      return;
    }
    setDraftPreset((currentDraft) => updater(clonePreset(currentDraft ?? emptyPresetBaseline)));
  };

  // Functions to update settings
  const addNewPreset = () => {
    const newPreset = buildNewPreset(t("printing.generic.newSetting"));
    const presets =
      hasPersistedPresets && localOrRemotePresets
        ? clonePresets(localOrRemotePresets)
        : [clonePreset(draftPreset ?? emptyPresetBaseline)];
    setLocalPresets([...presets, newPreset]);
    setDraftPreset(undefined);
    setSelectedPresetState(newPreset.labelSettings.printSettings.id);
    return newPreset;
  };
  const duplicateCurrentPreset = () => {
    const newPreset = clonePreset(curPreset);
    newPreset.labelSettings.printSettings.id = uuidv4();
    const presets =
      hasPersistedPresets && localOrRemotePresets
        ? clonePresets(localOrRemotePresets)
        : [clonePreset(draftPreset ?? emptyPresetBaseline)];
    setLocalPresets([...presets, newPreset]);
    setDraftPreset(undefined);
    setSelectedPresetState(newPreset.labelSettings.printSettings.id);
  };
  const deleteCurrentPreset = () => {
    if (!localOrRemotePresets) return;
    setLocalPresets(
      clonePresets(localOrRemotePresets).filter(
        (qPreset) => qPreset.labelSettings.printSettings.id !== selectedPresetState,
      ),
    );
    setSelectedPresetState(undefined);
  };

  useEffect(() => {
    if (localOrRemotePresets === undefined) {
      return;
    }
    if (localOrRemotePresets.length === 0) {
      setDraftPreset((currentDraft) => currentDraft ?? clonePreset(emptyPresetBaseline));
      if (selectedPresetState !== undefined) {
        setSelectedPresetState(undefined);
      }
      return;
    }
    if (draftPreset !== undefined) {
      setDraftPreset(undefined);
    }
    if (
      !selectedPresetState ||
      !localOrRemotePresets.some((preset) => preset.labelSettings.printSettings.id === selectedPresetState)
    ) {
      setSelectedPresetState(localOrRemotePresets[0].labelSettings.printSettings.id);
    }
  }, [draftPreset, emptyPresetBaseline, localOrRemotePresets, selectedPresetState, setSelectedPresetState]);

  const curPreset = useMemo(() => {
    if (!hasPersistedPresets) {
      return draftPreset ?? emptyPresetBaseline;
    }
    if (!selectedPresetState) {
      return localOrRemotePresets![0];
    }
    return (
      localOrRemotePresets!.find((preset) => preset.labelSettings.printSettings.id === selectedPresetState) ??
      localOrRemotePresets![0]
    );
  }, [draftPreset, emptyPresetBaseline, hasPersistedPresets, localOrRemotePresets, selectedPresetState]);
  const currentLabelSettings = useMemo(() => clonePreset(curPreset).labelSettings, [curPreset]);

  const [templateHelpOpen, setTemplateHelpOpen] = useState(false);
  const template =
    curPreset.template ??
    `**{filament.vendor.name} - {filament.name}
#{id} - {filament.material}**
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
        printSettings={currentLabelSettings}
        setPrintSettings={(newSettings) => {
          updateCurrentPreset((preset) => ({
            ...preset,
            labelSettings: clonePreset({ labelSettings: newSettings }).labelSettings,
          }));
        }}
        baseUrlRoot={baseUrlRoot}
        useHTTPUrl={useHTTPUrl}
        setUseHTTPUrl={setUseHTTPUrl}
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
                  updateCurrentPreset((preset) => ({
                    ...preset,
                    labelSettings: {
                      ...preset.labelSettings,
                      printSettings: {
                        ...preset.labelSettings.printSettings,
                        name: e.target.value,
                      },
                    },
                  }));
                }}
              />
            </Form.Item>
          </>
        }
        items={items.map((spool) => ({
          value: useHTTPUrl ? `${baseUrlRoot}/spool/show/${spool.id}` : `WEB+SPOOLMAN:S-${spool.id}`,
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
                  updateCurrentPreset((preset) => ({
                    ...preset,
                    template: newValue.target.value,
                  }));
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
              type={hasUnsavedPresetChanges ? "primary" : "default"}
              size="large"
              icon={<SaveOutlined />}
              loading={setRemotePresets.isPending}
              disabled={!hasUnsavedPresetChanges || setRemotePresets.isPending}
              onClick={async () => {
                try {
                  const wasSaved = await savePresetsRemote();
                  if (wasSaved) {
                    messageApi.success(t("notifications.saveSuccessful"));
                  }
                } catch (error) {
                  const fallback = t("notifications.error", { statusCode: "unknown" });
                  messageApi.error(error instanceof Error ? error.message : fallback);
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

export default SpoolQRCodePrintingDialog;
