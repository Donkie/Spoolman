// React FC that combines the functionality of first selecting what spools to print QR code for, and then opens up the QR code printing dialog.

import React from "react";
import { Button } from "antd";
import { ExportOutlined } from "@ant-design/icons";
import { useTranslate } from "@refinedev/core";
import { IFilament } from "../../../pages/filaments/model";
import FilamentExportDialog from "./filamentExportDialog";
import FilamentSelectModal from "../../filamentSelectModal";

const FilamentSelectAndExport: React.FC = () => {
  const t = useTranslate();

  const [step, setStep] = React.useState(0);
  const [selectedFilament, setSelectedFilament] = React.useState<IFilament[]>([]);

  return (
    <>
      <Button
        type="primary"
        icon={<ExportOutlined />}
        onClick={() => {
          setStep(1);
        }}
      >
        {"Export"}
      </Button>
      <FilamentSelectModal
        visible={step === 1}
        description={t("printing.spoolSelect.description")}
        onCancel={() => {
          setStep(0);
        }}
        onContinue={(filaments) => {
          setSelectedFilament(filaments);
          setStep(2);
        }}
      />
      <FilamentExportDialog
        visible={step === 2}
        onCancel={() => {
          setStep(0);
        }}
        items={selectedFilament}
      />
    </>
  );
};

export default FilamentSelectAndExport;
