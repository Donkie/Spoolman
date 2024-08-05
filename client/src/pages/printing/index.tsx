import React from "react";
import { IResourceComponentsProps, useTranslate } from "@refinedev/core";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { Content } from "antd/es/layout/layout";
import { theme } from "antd";
import SpoolQRCodePrintingDialog from "./spoolQrCodePrintingDialog";
import SpoolSelectModal from "./spoolSelectModal";
import { ISpool } from "../spools/model";
import { useNavigate, useSearchParams } from "react-router-dom";

dayjs.extend(utc);

const { useToken } = theme;

export const Printing: React.FC<IResourceComponentsProps> = () => {
  const { token } = useToken();
  const t = useTranslate();
  const [searchParams, setSearchParams] = useSearchParams();

  const spoolIds = searchParams.getAll("spools").map(Number);
  const step = spoolIds.length > 0 ? 1 : 0;

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
            setSearchParams((prev) => {
              const newParams = new URLSearchParams(prev);
              newParams.delete("spools");
              spools.forEach((spool) => newParams.append("spools", spool.id.toString()));
              return newParams;
            });
          }}
        />
      )}
      {step === 1 && <SpoolQRCodePrintingDialog spoolIds={spoolIds} />}
    </Content>
  );
};

export default Printing;
