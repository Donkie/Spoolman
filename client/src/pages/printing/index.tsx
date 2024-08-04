import React from "react";
import { IResourceComponentsProps, useTranslate } from "@refinedev/core";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { Content } from "antd/es/layout/layout";
import { theme } from "antd";
import SpoolQRCodePrintingDialog from "./spoolQrCodePrintingDialog";
import SpoolSelectModal from "./spoolSelectModal";
import { ISpool } from "../spools/model";

dayjs.extend(utc);

const { useToken } = theme;

export const Printing: React.FC<IResourceComponentsProps> = () => {
  const { token } = useToken();
  const t = useTranslate();

  const [step, setStep] = React.useState<0 | 1>(0);
  const [selectedSpools, setSelectedSpools] = React.useState<ISpool[]>([]);

  return (
    <Content
      style={{
        padding: 20,
        minHeight: 280,
        margin: "0 auto",
        backgroundColor: token.colorBgContainer,
        borderRadius: token.borderRadiusLG,
        color: token.colorText,
        fontFamily: token.fontFamily,
        fontSize: token.fontSizeLG,
        lineHeight: 1.5,
      }}
    >
      {step === 0 && (
        <SpoolSelectModal
          description={t("printing.spoolSelect.description")}
          onContinue={(spools) => {
            setSelectedSpools(spools);
            setStep(1);
          }}
        />
      )}
      {step === 1 && <SpoolQRCodePrintingDialog items={selectedSpools} />}
    </Content>
  );
};

export default Printing;
