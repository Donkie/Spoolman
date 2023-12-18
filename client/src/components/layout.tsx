import { ThemedLayoutV2, ThemedSiderV2, ThemedTitleV2 } from "@refinedev/antd";
import { Header } from "./header";
import { Footer } from "antd/es/layout/layout";
import { Version } from "./version";
import { Button } from "antd";
import Logo from "../icon.svg?react";
import { useTranslate } from "@refinedev/core";

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
                src="/kofi_s_logo_nolabel.png"
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
  <ThemedLayoutV2
    Header={() => <Header sticky />}
    Sider={() => (
      <ThemedSiderV2
        fixed
        Title={({ collapsed }) => <ThemedTitleV2 collapsed={collapsed} text="Spoolman" icon={<Logo />} />}
      />
    )}
    Footer={() => <SpoolmanFooter />}
  >
    {children}
  </ThemedLayoutV2>
);
