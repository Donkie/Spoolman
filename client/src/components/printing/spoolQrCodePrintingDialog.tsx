import { Form, Switch, Input } from "antd";
import { IFilament } from "../../pages/filaments/model";
import { ISpool } from "../../pages/spools/model";
import QRCodePrintingDialog from "./qrCodePrintingDialog";
import { useSavedState } from "../../utils/saveload";
import { useTranslate } from "@refinedev/core";
import renderLabelTemplate from "./renderLabelText";
import {useCurrency} from "../../utils/settings";

const { TextArea } = Input;

interface SpoolQRCodePrintingDialog {
  visible: boolean;
  items: ISpool[];
  onCancel: () => void;
}

const SpoolQRCodePrintingDialog: React.FC<SpoolQRCodePrintingDialog> = ({ visible, items, onCancel }) => {
  const t = useTranslate();

  const currency = useCurrency()

  const [showVendor, setShowVendor] = useSavedState("print-showVendor", true);
  const [showLotNr, setShowLotNr] = useSavedState("print-showLotNr", true);
  const [showSpoolWeight, setShowSpoolWeight] = useSavedState("print-showSpoolWeight", true);
  const [showTemperatures, setShowTemperatures] = useSavedState("print-showTemperatures", true);
  const [showSpoolComment, setShowSpoolComment] = useSavedState("print-showSpoolComment", false);
  const [showFilamentComment, setShowFilamentComment] = useSavedState("print-showFilamentComment", false);
  const [showVendorComment, setShowVendorComment] = useSavedState("print-showVendorComment", false);

  const [labelTextTemplate, setLabelTextTemplate] = useSavedState("print-labelTextTemplate", "<b>{{id}}{ - {vendor}}</b>\n<b>{{material}} - {{name}}</b>\n{Lot No: {lot_nr}}\n{Spool Weight: {spool_weight}}\n{Tool temp: {extruder_temp}}\n{Bed temp: {bed_temp}}");

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
		
		const renderedTemplate = renderLabelTemplate(spool, labelTextTemplate, currency);

        return {
          value: `web+spoolman:s-${spool.id}`,
          label: (
            <p
              style={{
                padding: "1mm 1mm 1mm 0",
              }}
			  dangerouslySetInnerHTML={{__html: renderedTemplate}}
			  >
            </p>
          ),
          errorLevel: "H",
        };
      })}
      extraSettings={
        <>
          <Form.Item label={t("printing.qrcode.showVendor")}>
			<TextArea rows={4} value={labelTextTemplate} autoSize onChange={(e) => setLabelTextTemplate(e.target.value)}/>
          </Form.Item>
        </>
      }
    />
  );
};

export default SpoolQRCodePrintingDialog;
