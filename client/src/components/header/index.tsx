import { BulbFilled, SettingFilled } from "@ant-design/icons";
import type { RefineThemedLayoutV2HeaderProps } from "@refinedev/antd";
import { useGetLocale, useSetLocale } from "@refinedev/core";
import { Button, Dropdown, Layout as AntdLayout, MenuProps, theme } from "antd";
import React, { useContext } from "react";

import "/node_modules/flag-icons/css/flag-icons.min.css";
import { languages } from "../../i18n";
import QRCodeScannerModal from "../qrCodeScanner";
import { SettingsContext } from "../../contexts/settings";

const { useToken } = theme;

export const Header: React.FC<RefineThemedLayoutV2HeaderProps> = ({ sticky }) => {
  const { token } = useToken();
  const locale = useGetLocale();
  const changeLanguage = useSetLocale();
  const { settings, setSetting } = useContext(SettingsContext);

  const currentLocale = locale();

  const menuItems: MenuProps["items"] = [...(Object.keys(languages) || [])].sort().map((lang: string) => ({
    key: lang,
    onClick: () => changeLanguage(lang),
    icon: <span className={"fi fi-" + languages[lang].countryCode} style={{ marginRight: 8 }} />,
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
      <Dropdown
        menu={{
          items: [
            {
              key: "colorMode",
              onClick: () => setSetting("colorMode", settings.colorMode === "light" ? "dark" : "light"),
              icon: settings.colorMode === "dark" ? <BulbFilled /> : <BulbFilled />,
              label: settings.colorMode === "dark" ? "Light Theme" : "Dark Theme",
            },
            {
              key: "language",
              label: languages[currentLocale ?? "en"].name,
              icon: <span className={"fi fi-" + languages[currentLocale ?? "en"].countryCode} />,
              children: menuItems,
            },
          ],
        }}
      >
        <Button size="large" type="text" icon={<SettingFilled />} />
      </Dropdown>
      <QRCodeScannerModal />
    </AntdLayout.Header>
  );
};
