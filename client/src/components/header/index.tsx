import { DownOutlined } from "@ant-design/icons";
import type { RefineThemedLayoutV2HeaderProps } from "@refinedev/antd";
import { useGetLocale, useSetLocale } from "@refinedev/core";
import { Layout as AntdLayout, Button, Dropdown, MenuProps, Space, Switch, theme } from "antd";
import React, { useContext } from "react";
import { ColorModeContext } from "../../contexts/color-mode";

import { languages } from "../../i18n";
import QRCodeScannerModal from "../qrCodeScanner";

const { useToken } = theme;

export const Header: React.FC<RefineThemedLayoutV2HeaderProps> = ({ sticky }) => {
  const { token } = useToken();
  const locale = useGetLocale();
  const changeLanguage = useSetLocale();
  const { mode, setMode } = useContext(ColorModeContext);

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
