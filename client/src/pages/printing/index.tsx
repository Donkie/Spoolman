import React from "react";
import { IResourceComponentsProps, useTranslate } from "@refinedev/core";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { Content } from "antd/es/layout/layout";
import { theme } from "antd";
import SpoolQRCodePrintingDialog from "./spoolQrCodePrintingDialog";
import SpoolSelectModal from "./spoolSelectModal";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PageHeader } from "@refinedev/antd";

dayjs.extend(utc);

const { useToken } = theme;

export const Printing: React.FC<IResourceComponentsProps> = () => {
  const { token } = useToken();
  const t = useTranslate();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const spoolIds = searchParams.getAll("spools").map(Number);
  const step = spoolIds.length > 0 ? 1 : 0;

  return (
    <>
      <PageHeader
        title="Print QR Codes"
        onBack={() => {
          const returnUrl = searchParams.get("return");
          if (returnUrl) {
            navigate(returnUrl, { relative: "path" });
          } else {
            navigate("/spool");
          }
        }}
      >
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
                  newParams.set("return", "/spool/print");
                  return newParams;
                });
              }}
            />
          )}
          {step === 1 && <SpoolQRCodePrintingDialog spoolIds={spoolIds} />}
        </Content>
      </PageHeader>
    </>
  );
};

export default Printing;
