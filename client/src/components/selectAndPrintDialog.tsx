// React FC that combines the functionality of first selecting what spools to print QR code for, and then opens up the QR code printing dialog.

import React from "react";
import SpoolSelectModal from "./spoolSelectModal";
import QRCodePrintingDialog from "./printing/qrCodePrintingDialog";
import { Button } from "antd";
import { ISpool } from "../pages/spools/model";
import { PrinterOutlined } from "@ant-design/icons";
import { useTranslate } from "@refinedev/core";
import { IFilament } from "../pages/filaments/model";

const SelectAndPrint: React.FC = () => {
  const t = useTranslate();

  const [step, setStep] = React.useState(0);
  const [selectedSpools, setSelectedSpools] = React.useState<ISpool[]>([]);

  const formatFilament = (filament: IFilament) => {
    let vendorPrefix = "";
    if (filament.vendor) {
      vendorPrefix = `${filament.vendor.name} - `;
    }
    let name = filament.name;
    if (!name) {
      name = `ID: ${filament.id}`;
    }
    return `${vendorPrefix}${name}`;
  };

  return (
    <>
      <Button
        type="primary"
        icon={<PrinterOutlined />}
        onClick={() => {
          setStep(1);
        }}
      >
        {t("printing.qrcode.button")}
      </Button>
      <SpoolSelectModal
        visible={step === 1}
        description={t("printing.spoolSelect.description")}
        onCancel={() => {
          setStep(0);
        }}
        onContinue={(spools) => {
          setSelectedSpools(spools);
          setStep(2);
        }}
      />
      <QRCodePrintingDialog
        visible={step === 2}
        onCancel={() => {
          setStep(1);
        }}
        items={selectedSpools.map(function (spool) {
          const temps = [];
          if (spool.filament.settings_extruder_temp) {
            temps.push(`ET: ${spool.filament.settings_extruder_temp} °C`);
          }
          if (spool.filament.settings_bed_temp) {
            temps.push(`BT: ${spool.filament.settings_bed_temp} °C`);
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
                {spool.filament.spool_weight && (
                  <>
                    <br />
                    Spool Weight: {spool.filament.spool_weight ?? "?"} g
                  </>
                )}
                {tempLine && (
                  <>
                    <br />
                    {tempLine}
                  </>
                )}
                {spool.lot_nr && (
                  <>
                    <br />
                    Lot Nr: {spool.lot_nr}
                  </>
                )}
              </p>
            ),
            errorLevel: "H",
          };
        })}
      />
    </>
  );
};

export default SelectAndPrint;
