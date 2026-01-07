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

    // Check for the spoolman ID format
    const match = result.match(/^web\+spoolman:s-(?<id>[0-9]+)$/);
    if (match && match.groups) {
      setVisible(false);
      navigate(`/spool/show/${match.groups.id}`);
    }
    const fullURLmatch = result.match(/^https?:\/\/[^/]+\/spool\/show\/(?<id>[0-9]+)$/);
    if (fullURLmatch && fullURLmatch.groups) {
      setVisible(false);
      navigate(`/spool/show/${fullURLmatch.groups.id}`);
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
            formats={["qr_code"]}
            onError={(err: unknown) => {
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
