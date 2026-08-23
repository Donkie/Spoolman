import { ThemedLayout, ThemedSider, ThemedTitle } from "@refinedev/antd";
import { useTranslate } from "@refinedev/core";
import { Button } from "antd";
import { Footer } from "antd/es/layout/layout";
import Logo from "../icon.svg?react";
import { Header } from "./header";
import { Version } from "./version";

const SponsorHeart = () => (
  <svg viewBox="0 0 16 16" width="1.2em" height="1.2em" fill="#db61a2" aria-hidden="true">
    <path d="m8 14.25.345.666a.75.75 0 0 1-.69 0l-.008-.004-.018-.01a7.152 7.152 0 0 1-.31-.17 22.055 22.055 0 0 1-3.434-2.414C2.045 10.731 0 8.35 0 5.5 0 2.836 2.086 1 4.25 1 5.797 1 7.153 1.802 8 3.02 8.847 1.802 10.203 1 11.75 1 13.914 1 16 2.836 16 5.5c0 2.85-2.045 5.231-3.885 6.818a22.066 22.066 0 0 1-3.744 2.584l-.018.01-.006.003h-.002Z" />
  </svg>
);

const SpoolmanFooter = () => {
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
            icon={<SponsorHeart />}
            type="text"
            href="https://github.com/sponsors/Donkie"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("sponsor")}
          </Button>
        </div>
      </div>
    </Footer>
  );
};

export const SpoolmanLayout = ({ children }: { children: React.ReactNode }) => (
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
