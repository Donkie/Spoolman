import { DesktopOutlined, DownOutlined, MoonOutlined, SunOutlined } from "@ant-design/icons";
import type { RefineThemedLayoutHeaderProps } from "@refinedev/antd";
import { useGetLocale, useSetLocale, useTranslate } from "@refinedev/core";
import { Layout as AntdLayout, Button, Dropdown, MenuProps, Segmented, Space, theme } from "antd";
import React, { useContext } from "react";
import { ColorModeContext, ThemePreference } from "../../contexts/color-mode";

import { languages } from "../../i18n";
import QRCodeScannerModal from "../qrCodeScanner";

const { useToken } = theme;

export const Header = ({ sticky }: RefineThemedLayoutHeaderProps) => {
  const { token } = useToken();
  const t = useTranslate();
  const locale = useGetLocale();
  const changeLanguage = useSetLocale();
  const { preference, setPreference } = useContext(ColorModeContext);

  const currentLocale = locale();

  const themeOptions = [
    { value: "system", icon: <DesktopOutlined />, title: t("theme.system") },
    { value: "light", icon: <SunOutlined />, title: t("theme.light") },
    { value: "dark", icon: <MoonOutlined />, title: t("theme.dark") },
  ];

  const menuItems: MenuProps["items"] = [...(Object.keys(languages) || [])].sort().map((lang: string) => ({
    key: lang,
    onClick: () => changeLanguage(lang),
    label: languages[lang].name,
  }));

  const headerStyles: React.CSSProperties = {
    backgroundColor: token.colorBgElevated,
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "center",
    padding: "0px 24px",
    height: "64px",
  };

  if (sticky) {
    headerStyles.position = "sticky";
    headerStyles.top = 0;
    headerStyles.zIndex = 1;
  }

  return (
    <AntdLayout.Header className="spoolman-header" style={headerStyles}>
      <Space className="spoolman-header-actions" wrap>
        <Dropdown
          menu={{
            items: menuItems,
            selectedKeys: currentLocale ? [currentLocale] : [],
          }}
        >
          <Button type="text">
            <Space>
              {languages[currentLocale ?? "en"].name}
              <DownOutlined />
            </Space>
          </Button>
        </Dropdown>
        <Segmented
          aria-label={t("theme.label")}
          options={themeOptions}
          value={preference}
          onChange={(value) => setPreference(value as ThemePreference)}
        />
        <QRCodeScannerModal />
      </Space>
    </AntdLayout.Header>
  );
};
