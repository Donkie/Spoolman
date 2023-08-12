import { Form, Switch } from "antd";
import { IFilament } from "../../pages/filaments/model";
import { ISpool } from "../../pages/spools/model";
import QRCodePrintingDialog from "./qrCodePrintingDialog";
import { useSavedState } from "../../utils/saveload";
import { useTranslate } from "@refinedev/core";

interface SpoolQRCodePrintingDialog {
  visible: boolean;
  items: ISpool[];
  onCancel: () => void;
}

const SpoolQRCodePrintingDialog: React.FC<SpoolQRCodePrintingDialog> = ({ visible, items, onCancel }) => {
  const t = useTranslate();

  const [showVendor, setShowVendor] = useSavedState("print-showVendor", true);
  const [showLotNr, setShowLotNr] = useSavedState("print-showLotNr", true);
  const [showSpoolWeight, setShowSpoolWeight] = useSavedState("print-showSpoolWeight", true);
  const [showTemperatures, setShowTemperatures] = useSavedState("print-showTemperatures", true);
  const [showSpoolComment, setShowSpoolComment] = useSavedState("print-showSpoolComment", false);
  const [showFilamentComment, setShowFilamentComment] = useSavedState("print-showFilamentComment", false);
  const [showVendorComment, setShowVendorComment] = useSavedState("print-showVendorComment", false);

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
            <Switch checked={showVendor} onChange={(checked) => setShowVendor(checked)} />
          </Form.Item>
          <Form.Item label={t("printing.qrcode.showSpoolWeight")}>
            <Switch checked={showSpoolWeight} onChange={(checked) => setShowSpoolWeight(checked)} />
          </Form.Item>
          <Form.Item label={t("printing.qrcode.showTemperatures")}>
            <Switch checked={showTemperatures} onChange={(checked) => setShowTemperatures(checked)} />
          </Form.Item>
          <Form.Item label={t("printing.qrcode.showLotNr")}>
            <Switch checked={showLotNr} onChange={(checked) => setShowLotNr(checked)} />
          </Form.Item>
          <Form.Item label={t("printing.qrcode.showSpoolComment")}>
            <Switch checked={showSpoolComment} onChange={(checked) => setShowSpoolComment(checked)} />
          </Form.Item>
          <Form.Item label={t("printing.qrcode.showFilamentComment")}>
            <Switch checked={showFilamentComment} onChange={(checked) => setShowFilamentComment(checked)} />
          </Form.Item>
          <Form.Item label={t("printing.qrcode.showVendorComment")}>
            <Switch checked={showVendorComment} onChange={(checked) => setShowVendorComment(checked)} />
          </Form.Item>
        </>
      }
    />
  );
};

export default SpoolQRCodePrintingDialog;
