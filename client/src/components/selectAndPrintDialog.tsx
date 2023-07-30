// React FC that combines the functionality of first selecting what spools to print QR code for, and then opens up the QR code printing dialog.

import React from "react";
import SpoolSelectModal from "./spoolSelectModal";
import QRCodePrintingDialog from "./printing/qrCodePrintingDialog";
import { Button } from "antd";
import { ISpool } from "../pages/spools/model";
import { PrinterOutlined } from "@ant-design/icons";

const SelectAndPrint: React.FC = () => {
  const [step, setStep] = React.useState(0);
  const [selectedSpools, setSelectedSpools] = React.useState<ISpool[]>([]);
  return (
    <>
      <Button
        type="primary"
        icon={<PrinterOutlined />}
        onClick={() => {
          setStep(1);
        }}
      >
        Print QR Codes
      </Button>
      <SpoolSelectModal
        visible={step === 1}
        description="Select spools to print QR codes for."
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
        items={selectedSpools.map((spool) => ({
          value: `S:${spool.id}`,
          //   value: `https://spoolman.lan/spool/show/${spool.id}`,
          // label: `hello`,
          errorLevel: "H",
        }))}
      />
    </>
  );
};

export default SelectAndPrint;
