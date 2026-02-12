import { PageHeader } from "@refinedev/antd";
import { useTranslate } from "@refinedev/core";
import { theme } from "antd";
import { Content } from "antd/es/layout/layout";
import { useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router";
import FilamentQRCodePrintingDialog from "../printing/filamentQrCodePrintingDialog";

const { useToken } = theme;

export const FilamentPrinting = () => {
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
        title={t("printing.qrcode.button")}
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
          {filamentIds.length > 0 && <FilamentQRCodePrintingDialog filamentIds={filamentIds} />}
        </Content>
      </PageHeader>
    </>
  );
};

export default FilamentPrinting;
