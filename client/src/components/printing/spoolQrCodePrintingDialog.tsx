import { Button, Flex, Form, Input, Modal, Popconfirm, Select, Space, Switch } from "antd";
import { IFilament } from "../../pages/filaments/model";
import { ISpool } from "../../pages/spools/model";
import QRCodePrintingDialog from "./qrCodePrintingDialog";
import { useSavedState } from "../../utils/saveload";
import { useTranslate } from "@refinedev/core";
import { QRCodePrintSettings, SpoolQRCodePrintSettings, useGetPrintSettings, useSetPrintSettings } from "./printing";
import { useMemo, useState } from "react";
import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { v4 as uuidv4 } from "uuid";
import _ from "lodash";

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

  const showVendor = selectedPrintSetting?.showVendor;
  const showLotNr = selectedPrintSetting?.showLotNr;
  const showSpoolWeight = selectedPrintSetting?.showSpoolWeight;
  const showTemperatures = selectedPrintSetting?.showTemperatures;
  const showSpoolComment = selectedPrintSetting?.showSpoolComment;
  const showFilamentComment = selectedPrintSetting?.showFilamentComment;
  const showVendorComment = selectedPrintSetting?.showVendorComment;

  const formatFilament = (filament: IFilament) => {
    let vendorPrefix = "";
    if (showVendor && filament.vendor) {
      vendorPrefix = `${filament.vendor.name} - `;
    }
    let name = filament.name;
    if (!name) {
      name = `Filament #${filament.id}`;
    }
    return `${vendorPrefix}${name}`;
  };

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
        const temps = [];
        if (spool.filament.settings_extruder_temp) {
          temps.push(t("printing.qrcode.extruderTemp", { temp: `${spool.filament.settings_extruder_temp} °C` }));
        }
        if (spool.filament.settings_bed_temp) {
          temps.push(t("printing.qrcode.bedTemp", { temp: `${spool.filament.settings_bed_temp} °C` }));
        }
        const tempLine = temps.join(" - ");

        return {
          value: `web+spoolman:s-${spool.id}`,
          label: (
            <p
              style={{
                padding: "1mm 1mm 1mm 0",
              }}
            >
              <b>{formatFilament(spool.filament)}</b>
              <br />
              <b>
                #{spool.id}
                {spool.filament.material && <> - {spool.filament.material}</>}
              </b>
              {showSpoolWeight && (
                <>
                  <br />
                  {t("printing.qrcode.spoolWeight", { weight: `${spool.filament.spool_weight ?? "?"} g` })}
                </>
              )}
              {showTemperatures && tempLine && (
                <>
                  <br />
                  {tempLine}
                </>
              )}
              {showLotNr && (
                <>
                  <br />
                  {t("printing.qrcode.lotNr", { lot: spool.lot_nr ?? "?" })}
                </>
              )}
              {showSpoolComment && spool.comment && (
                <>
                  <br />
                  {spool.comment}
                </>
              )}
              {showFilamentComment && spool.filament.comment && (
                <>
                  <br />
                  {spool.filament.comment}
                </>
              )}
              {showVendorComment && spool.filament.vendor?.comment && (
                <>
                  <br />
                  {spool.filament.vendor.comment}
                </>
              )}
            </p>
          ),
          errorLevel: "H",
        };
      })}
      extraSettings={
        <>
          <Form.Item label={t("printing.qrcode.showVendor")}>
            <Switch
              checked={showVendor}
              onChange={(checked) => {
                selectedPrintSetting.showVendor = checked;
                updateCurrentPrintSettings(selectedPrintSetting);
              }}
            />
          </Form.Item>
          <Form.Item label={t("printing.qrcode.showSpoolWeight")}>
            <Switch
              checked={showSpoolWeight}
              onChange={(checked) => {
                selectedPrintSetting.showSpoolWeight = checked;
                updateCurrentPrintSettings(selectedPrintSetting);
              }}
            />
          </Form.Item>
          <Form.Item label={t("printing.qrcode.showTemperatures")}>
            <Switch
              checked={showTemperatures}
              onChange={(checked) => {
                selectedPrintSetting.showTemperatures = checked;
                updateCurrentPrintSettings(selectedPrintSetting);
              }}
            />
          </Form.Item>
          <Form.Item label={t("printing.qrcode.showLotNr")}>
            <Switch
              checked={showLotNr}
              onChange={(checked) => {
                selectedPrintSetting.showLotNr = checked;
                updateCurrentPrintSettings(selectedPrintSetting);
              }}
            />
          </Form.Item>
          <Form.Item label={t("printing.qrcode.showSpoolComment")}>
            <Switch
              checked={showSpoolComment}
              onChange={(checked) => {
                selectedPrintSetting.showSpoolComment = checked;
                updateCurrentPrintSettings(selectedPrintSetting);
              }}
            />
          </Form.Item>
          <Form.Item label={t("printing.qrcode.showFilamentComment")}>
            <Switch
              checked={showFilamentComment}
              onChange={(checked) => {
                selectedPrintSetting.showFilamentComment = checked;
                updateCurrentPrintSettings(selectedPrintSetting);
              }}
            />
          </Form.Item>
          <Form.Item label={t("printing.qrcode.showVendorComment")}>
            <Switch
              checked={showVendorComment}
              onChange={(checked) => {
                selectedPrintSetting.showVendorComment = checked;
                updateCurrentPrintSettings(selectedPrintSetting);
              }}
            />
          </Form.Item>
        </>
      }
    />
  );
};

export default SpoolQRCodePrintingDialog;
