// React FC that combines the functionality of first selecting what spools to print QR code for, and then opens up the QR code printing dialog.

import React from "react";
import { Button } from "antd";
import { ExportOutlined } from "@ant-design/icons";
import { useTranslate } from "@refinedev/core";
import { IVendor } from "../../../pages/vendors/model";
import VendorSelectModal from "../../vendorSelectModal";
import VendorExportDialog from "./vendorExportDialog";

const VendorSelectAndExport: React.FC = () => {
  const t = useTranslate();

  const [step, setStep] = React.useState(0);
  const [selectedVendors, setSelectedVendors] = React.useState<IVendor[]>([]);

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
      <VendorSelectModal
        visible={step === 1}
        description={t("printing.spoolSelect.description")}
        onCancel={() => {
          setStep(0);
        }}
        onContinue={(vendors) => {
          setSelectedVendors(vendors);
          setStep(2);
        }}
      />
      <VendorExportDialog
        visible={step === 2}
        onCancel={() => {
          setStep(0);
        }}
        items={selectedVendors}
      />
    </>
  );
};

export default VendorSelectAndExport;
