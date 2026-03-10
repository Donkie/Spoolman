import { PageHeader } from "@refinedev/antd";
import { useTranslate } from "@refinedev/core";
import { theme } from "antd";
import { Content } from "antd/es/layout/layout";
import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router";
import FilamentSelectModal from "../printing/filamentSelectModal";

const { useToken } = theme;

export const FilamentLabels = () => {
  const { token } = useToken();
  const t = useTranslate();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const returnUrl = searchParams.get("return");
  const initialSelectedIds = searchParams.getAll("filaments").map(Number).filter((id) => !Number.isNaN(id));

  const selectionPath = useMemo(() => {
    const params = new URLSearchParams();
    if (returnUrl) {
      params.set("return", returnUrl);
    }
    const query = params.toString();
    return `/filament/labels${query ? `?${query}` : ""}`;
  }, [returnUrl]);

  const handleNavigate = (mode: "print" | "export", ids: number[]) => {
    const params = new URLSearchParams();
    ids.forEach((id) => params.append("filaments", id.toString()));
    params.set("return", selectionPath);
    navigate(`/filament/${mode}?${params.toString()}`);
  };

  return (
    <>
      <PageHeader
        title={t("printing.qrcode.selectTitle")}
        onBack={() => {
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
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <FilamentSelectModal
            description={t("printing.filamentSelect.description")}
            initialSelectedIds={initialSelectedIds}
            onPrint={(ids) => handleNavigate("print", ids)}
            onExport={(ids) => handleNavigate("export", ids)}
          />
        </Content>
      </PageHeader>
    </>
  );
};

export default FilamentLabels;
