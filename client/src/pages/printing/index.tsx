import { PageHeader } from "@refinedev/antd";
import { useTranslate } from "@refinedev/core";
import { theme } from "antd";
import { Content } from "antd/es/layout/layout";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { useNavigate, useSearchParams } from "react-router";
import SpoolQRCodePrintingDialog from "./spoolQrCodePrintingDialog";
import SpoolSelectModal from "./spoolSelectModal";

dayjs.extend(utc);

const { useToken } = theme;

export const Printing = () => {
  const { token } = useToken();
  const t = useTranslate();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const spoolIds = searchParams.getAll("spools").map(Number);
  const step = spoolIds.length > 0 ? 1 : 0;

  return (
    <>
      <PageHeader
        title={t("printing.qrcode.button")}
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
              searchPlaceholder={t("printing.spoolSelect.searchPlaceholder")}
              onPrint={(selectedIds) => {
                setSearchParams((prev) => {
                  const newParams = new URLSearchParams(prev);
                  newParams.delete("spools");
                  selectedIds.forEach((id) => newParams.append("spools", id.toString()));
                  // Keep the selector route as the explicit return target so back/cancel
                  // returns to the selection step instead of the originating show page.
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
