// React FC that combines the functionality of first selecting what spools to print QR code for, and then opens up the QR code printing dialog.

import React from "react";
import SpoolSelectModal from "./spoolSelectModal";
import { Button } from "antd";
import { ISpool } from "../pages/spools/model";
import { PrinterOutlined } from "@ant-design/icons";
import { useTranslate } from "@refinedev/core";
import SpoolQRCodePrintingDialog from "./printing/spoolQrCodePrintingDialog";

const SelectAndPrint: React.FC = () => {
  const t = useTranslate();

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
      <SpoolQRCodePrintingDialog
        visible={step === 2}
        onCancel={() => {
          setStep(0);
        }}
        items={selectedSpools}
      />
    </>
  );
};

export default SelectAndPrint;
