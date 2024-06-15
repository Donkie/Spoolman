import { Form, Switch } from "antd";
import { IFilament } from "../../pages/filaments/model";
import { ISpool } from "../../pages/spools/model";
import QRCodePrintingDialog from "./qrCodePrintingDialog";
import { useSavedState } from "../../utils/saveload";
import { useTranslate } from "@refinedev/core";
import { useGetPrintSettings, useSetPrintSettings } from "./printing";

interface SpoolQRCodePrintingDialog {
  visible: boolean;
  items: ISpool[];
  onCancel: () => void;
}

const SpoolQRCodePrintingDialog: React.FC<SpoolQRCodePrintingDialog> = ({ visible, items, onCancel }) => {
  const t = useTranslate();
  const printSettings = useGetPrintSettings()[0];
  const setPrintSettings = useSetPrintSettings();

  const showVendor = printSettings?.showVendor;
  const showLotNr = printSettings?.showLotNr;
  const showSpoolWeight = printSettings?.showSpoolWeight;
  const showTemperatures = printSettings?.showTemperatures;
  const showSpoolComment = printSettings?.showSpoolComment;
  const showFilamentComment = printSettings?.showFilamentComment;
  const showVendorComment = printSettings?.showVendorComment;

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
      printSettings={printSettings.labelSettings}
      setPrintSettings={(newSettings) => {
        printSettings.labelSettings = newSettings;
        setPrintSettings([printSettings]);
      }}
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
                printSettings.showVendor = checked;
                setPrintSettings([printSettings]);
              }}
            />
          </Form.Item>
          <Form.Item label={t("printing.qrcode.showSpoolWeight")}>
            <Switch
              checked={showSpoolWeight}
              onChange={(checked) => {
                printSettings.showSpoolWeight = checked;
                setPrintSettings([printSettings]);
              }}
            />
          </Form.Item>
          <Form.Item label={t("printing.qrcode.showTemperatures")}>
            <Switch
              checked={showTemperatures}
              onChange={(checked) => {
                printSettings.showTemperatures = checked;
                setPrintSettings([printSettings]);
              }}
            />
          </Form.Item>
          <Form.Item label={t("printing.qrcode.showLotNr")}>
            <Switch
              checked={showLotNr}
              onChange={(checked) => {
                printSettings.showLotNr = checked;
                setPrintSettings([printSettings]);
              }}
            />
          </Form.Item>
          <Form.Item label={t("printing.qrcode.showSpoolComment")}>
            <Switch
              checked={showSpoolComment}
              onChange={(checked) => {
                printSettings.showSpoolComment = checked;
                setPrintSettings([printSettings]);
              }}
            />
          </Form.Item>
          <Form.Item label={t("printing.qrcode.showFilamentComment")}>
            <Switch
              checked={showFilamentComment}
              onChange={(checked) => {
                printSettings.showFilamentComment = checked;
                setPrintSettings([printSettings]);
              }}
            />
          </Form.Item>
          <Form.Item label={t("printing.qrcode.showVendorComment")}>
            <Switch
              checked={showVendorComment}
              onChange={(checked) => {
                printSettings.showVendorComment = checked;
                setPrintSettings([printSettings]);
              }}
            />
          </Form.Item>
        </>
      }
    />
  );
};

export default SpoolQRCodePrintingDialog;
