import { ThemedLayout, ThemedSider, ThemedTitle } from "@refinedev/antd";
import { useTranslate } from "@refinedev/core";
import { Button } from "antd";
import { Footer } from "antd/es/layout/layout";
import Logo from "../icon.svg?react";
import { getBasePath } from "../utils/url";
import { Header } from "./header";
import { Version } from "./version";

const SpoolmanFooter: React.FC = () => {
  const t = useTranslate();

  return (
    <Footer style={{ textAlign: "center" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          flexDirection: "row",
          gap: "2em",
        }}
      >
        <div>
          {t("version")} <Version />
        </div>
        <div>
          <Button
            icon={
              <img
                src={getBasePath() + "/kofi_s_logo_nolabel.png"}
                style={{
                  height: "1.6em",
                }}
              />
            }
            type="text"
            href="https://ko-fi.com/donkie"
            target="_blank"
          >
            {t("kofi")}
          </Button>
        </div>
      </div>
    </Footer>
  );
};

interface SpoolmanLayoutProps {
  children: React.ReactNode;
}

export const SpoolmanLayout: React.FC<SpoolmanLayoutProps> = ({ children }) => (
  <ThemedLayout
    Header={() => <Header sticky />}
    Sider={() => (
      <ThemedSider
        fixed
        Title={({ collapsed }) => <ThemedTitle collapsed={collapsed} text="Spoolman" icon={<Logo />} />}
      />
    )}
    Footer={() => <SpoolmanFooter />}
  >
    {children}
  </ThemedLayout>
);
