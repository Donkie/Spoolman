import { PageHeader } from "@refinedev/antd";
import { useTranslate } from "@refinedev/core";
import { theme } from "antd";
import { Content } from "antd/es/layout/layout";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { useNavigate, useSearchParams } from "react-router";
import FilamentQRCodePrintingDialog from "../printing/filamentQrCodePrintingDialog";
import FilamentSelectModal from "../printing/filamentSelectModal";

dayjs.extend(utc);

const { useToken } = theme;

export const FilamentPrinting = () => {
  const { token } = useToken();
  const t = useTranslate();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const filamentIds = searchParams.getAll("filaments").map(Number);
  const step = filamentIds.length > 0 ? 1 : 0;

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
          {step === 0 && (
            <FilamentSelectModal
              description={t("printing.filamentSelect.description")}
              onContinue={(filaments) => {
                setSearchParams((prev) => {
                  const newParams = new URLSearchParams(prev);
                  newParams.delete("filaments");
                  filaments.forEach((filament) => newParams.append("filaments", filament.id.toString()));
                  newParams.set("return", "/filament/print");
                  return newParams;
                });
              }}
            />
          )}
          {step === 1 && <FilamentQRCodePrintingDialog filamentIds={filamentIds} />}
        </Content>
      </PageHeader>
    </>
  );
};

export default FilamentPrinting;
