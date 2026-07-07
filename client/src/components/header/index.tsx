import { DownOutlined } from "@ant-design/icons";
import type { RefineThemedLayoutHeaderProps } from "@refinedev/antd";
import { useGetLocale, useSetLocale, useTranslate } from "@refinedev/core";
import { Grid, Layout as AntdLayout, Button, Dropdown, MenuProps, Space, Switch, theme } from "antd";
import React, { useContext } from "react";
import { ColorModeContext } from "../../contexts/color-mode";
import { getBasePath } from "../../utils/url";
import { Version } from "../version";

import { languages } from "../../i18n";
import QRCodeScannerModal from "../qrCodeScanner";

const { useToken } = theme;

export const Header = ({ sticky }: RefineThemedLayoutHeaderProps) => {
  const { token } = useToken();
  const locale = useGetLocale();
  const changeLanguage = useSetLocale();
  const { mode, setMode } = useContext(ColorModeContext);
  const t = useTranslate();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;

  const currentLocale = locale();

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
    <AntdLayout.Header style={headerStyles}>
      <Space size="small" style={{ marginRight: "auto", opacity: 0.85, fontSize: 12, marginLeft: isMobile ? 48 : 0 }}>
        {isMobile ? <Version /> : <span>{t("version")} <Version /></span>}
        <Button
          icon={<img src={getBasePath() + "/kofi_s_logo_nolabel.png"} style={{ height: "1.4em" }} />}
          type="text"
          size="small"
          href="https://ko-fi.com/donkie"
          target="_blank"
          style={{ fontSize: 12, opacity: 0.7, padding: "0 4px" }}
        >
          {!isMobile && t("kofi")}
        </Button>
      </Space>
      <Space>
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
        <Switch
          checkedChildren="🌛"
          unCheckedChildren="🔆"
          onChange={() => setMode(mode === "light" ? "dark" : "light")}
          defaultChecked={mode === "dark"}
        />
        <QRCodeScannerModal />
      </Space>
    </AntdLayout.Header>
  );
};
