import { PageHeader } from "@refinedev/antd";
import { useTranslate } from "@refinedev/core";
import { theme } from "antd";
import { Content } from "antd/es/layout/layout";
import { useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router";
import SpoolQRCodeExportDialog from "../printing/spoolQrCodeExportDialog";

const { useToken } = theme;

export const PrintingExport = () => {
  const { token } = useToken();
  const t = useTranslate();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const spoolIds = searchParams.getAll("spools").map(Number);
  const returnUrl = searchParams.get("return");
  const selectionPath = useMemo(() => {
    const params = new URLSearchParams();
    if (returnUrl) {
      params.set("return", returnUrl);
    }
    const query = params.toString();
    return `/spool/labels${query ? `?${query}` : ""}`;
  }, [returnUrl]);

  useEffect(() => {
    if (spoolIds.length === 0) {
      navigate(selectionPath, { replace: true });
    }
  }, [navigate, selectionPath, spoolIds.length]);

  return (
    <>
      <PageHeader
        title={t("printing.qrcode.exportButton")}
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
          {spoolIds.length > 0 && <SpoolQRCodeExportDialog spoolIds={spoolIds} />}
        </Content>
      </PageHeader>
    </>
  );
};

export default PrintingExport;
