import { CameraOutlined } from "@ant-design/icons";
import { useTranslate } from "@refinedev/core";
import { IDetectedBarcode, Scanner } from "@yudiel/react-qr-scanner";
import { FloatButton, Modal, Space } from "antd";
import { useState } from "react";
import { useNavigate } from "react-router";

const QRCodeScannerModal = () => {
  const [visible, setVisible] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const t = useTranslate();
  const navigate = useNavigate();

  const onScan = (detectedCodes: IDetectedBarcode[]) => {
    if (detectedCodes.length === 0) {
      return;
    }
    const result = detectedCodes[0].rawValue;

    // Accept both compact WEB+SPOOLMAN payloads and full show-page URLs so
    // exported and printed labels keep scanning after base URL changes.
    const spoolMatch = result.match(/^web\+spoolman:s-(?<id>[0-9]+)$/i);
    if (spoolMatch && spoolMatch.groups) {
      setVisible(false);
      navigate(`/spool/show/${spoolMatch.groups.id}`);
      return;
    }
    const filamentMatch = result.match(/^web\+spoolman:f-(?<id>[0-9]+)$/i);
    if (filamentMatch && filamentMatch.groups) {
      setVisible(false);
      navigate(`/filament/show/${filamentMatch.groups.id}`);
      return;
    }
    const spoolURLmatch = result.match(/^https?:\/\/[^/]+(?:\/[^/]+)*\/spool\/show\/(?<id>[0-9]+)$/i);
    if (spoolURLmatch && spoolURLmatch.groups) {
      setVisible(false);
      navigate(`/spool/show/${spoolURLmatch.groups.id}`);
      return;
    }
    const filamentURLmatch = result.match(/^https?:\/\/[^/]+(?:\/[^/]+)*\/filament\/show\/(?<id>[0-9]+)$/i);
    if (filamentURLmatch && filamentURLmatch.groups) {
      setVisible(false);
      navigate(`/filament/show/${filamentURLmatch.groups.id}`);
    }
  };

  return (
    <>
      <FloatButton type="primary" onClick={() => setVisible(true)} icon={<CameraOutlined />} shape="circle" />
      <Modal open={visible} destroyOnHidden onCancel={() => setVisible(false)} footer={null} title={t("scanner.title")}>
        <Space direction="vertical" style={{ width: "100%" }}>
          <p>{t("scanner.description")}</p>
          <Scanner
            constraints={{
              facingMode: "environment",
            }}
            onScan={onScan}
            // Accept common 2D matrix codes, not just QR, so labels generated with e.g.
            // Data Matrix or Aztec codes can be scanned too (issue #887). Payloads that
            // don't match the spoolman format are ignored, so widening this is harmless.
            formats={["qr_code", "micro_qr_code", "rm_qr_code", "data_matrix", "aztec", "pdf417"]}
            onError={(err: unknown) => {
              // Map browser/scanner-library failures onto translated messages instead of
              // exposing raw exception names in the modal.
              const error = err as Error;
              console.error(error);
              if (error.name === "NotAllowedError") {
                setLastError(t("scanner.error.notAllowed"));
              } else if (
                error.name === "InsecureContextError" ||
                (location.protocol !== "https:" && navigator.mediaDevices === undefined)
              ) {
                setLastError(t("scanner.error.insecureContext"));
              } else if (error.name === "StreamApiNotSupportedError") {
                setLastError(t("scanner.error.streamApiNotSupported"));
              } else if (error.name === "NotReadableError") {
                setLastError(t("scanner.error.notReadable"));
              } else if (error.name === "NotFoundError") {
                setLastError(t("scanner.error.notFound"));
              } else {
                setLastError(t("scanner.error.unknown", { error: error.name }));
              }
            }}
          >
            {lastError && (
              <div
                style={{
                  position: "absolute",
                  textAlign: "center",
                  width: "100%",
                  top: "50%",
                }}
              >
                <p>{lastError}</p>
              </div>
            )}
          </Scanner>
        </Space>
      </Modal>
    </>
  );
};

export default QRCodeScannerModal;
