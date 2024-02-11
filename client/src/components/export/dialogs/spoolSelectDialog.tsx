// React FC that combines the functionality of first selecting what spools to print QR code for, and then opens up the QR code printing dialog.

import React from "react";
import { Button } from "antd";
import { ExportOutlined } from "@ant-design/icons";
import { useTranslate } from "@refinedev/core";
import { ISpool } from "../../../pages/spools/model";
import SpoolSelectModal from "../../spoolSelectModal";
import SpoolExportDialog from "./spoolExportDialog";

const SpoolSelectAndExport: React.FC = () => {
  const t = useTranslate();

  const [step, setStep] = React.useState(0);
  const [selectedSpools, setSelectedSpools] = React.useState<ISpool[]>([]);

  return (
    <>
      <Button
        type="primary"
        icon={<ExportOutlined />}
        onClick={() => {
          setStep(1);
        }}
      >
        {t("exporting.generic.export")}
      </Button>
      <SpoolSelectModal
        visible={step === 1}
        description={t("exporting.spoolSelect.description")}
        onCancel={() => {
          setStep(0);
        }}
        onContinue={(spools) => {
          setSelectedSpools(spools);
          setStep(2);
        }}
      />
      <SpoolExportDialog
        visible={step === 2}
        onCancel={() => {
          setStep(0);
        }}
        items={selectedSpools}
      />
    </>
  );
};

export default SpoolSelectAndExport;
