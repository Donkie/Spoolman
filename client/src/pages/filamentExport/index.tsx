import { PageHeader } from "@refinedev/antd";
import { useTranslate } from "@refinedev/core";
import { theme } from "antd";
import { Content } from "antd/es/layout/layout";
import { useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router";
import FilamentQRCodeExportDialog from "../printing/filamentQrCodeExportDialog";

const { useToken } = theme;

export const FilamentExport = () => {
  const { token } = useToken();
  const t = useTranslate();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const filamentIds = searchParams.getAll("filaments").map(Number);
  const returnUrl = searchParams.get("return");
  const selectionPath = useMemo(() => {
    const params = new URLSearchParams();
    if (returnUrl) {
      params.set("return", returnUrl);
    }
    const query = params.toString();
    return `/filament/labels${query ? `?${query}` : ""}`;
  }, [returnUrl]);

  useEffect(() => {
    if (filamentIds.length === 0) {
      navigate(selectionPath, { replace: true });
    }
  }, [filamentIds.length, navigate, selectionPath]);

  return (
    <>
      <PageHeader
        title={t("printing.qrcode.exportButton")}
        onBack={() => {
          const returnUrl = searchParams.get("return");
          if (returnUrl) {
            navigate(returnUrl, { relative: "path" });
          } else {
            navigate("/filament");
          }
        }}
      >
        <Content
          style={{
            padding: 20,
            minHeight: "70vh",
            height: "calc(100vh - 200px)",
            margin: "0 auto",
            backgroundColor: token.colorBgContainer,
            borderRadius: token.borderRadiusLG,
            color: token.colorText,
            fontFamily: token.fontFamily,
            fontSize: token.fontSizeLG,
            lineHeight: 1.5,
            overflow: "auto",
          }}
        >
          {filamentIds.length > 0 && <FilamentQRCodeExportDialog filamentIds={filamentIds} />}
        </Content>
      </PageHeader>
    </>
  );
};

export default FilamentExport;
