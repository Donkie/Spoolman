import { DownOutlined } from "@ant-design/icons";
import type { RefineThemedLayoutV2HeaderProps } from "@refinedev/antd";
import { useGetLocale, useSetLocale } from "@refinedev/core";
import {
  Button,
  Dropdown,
  Layout as AntdLayout,
  MenuProps,
  Space,
  Switch,
  theme,
} from "antd";
import React, { useContext } from "react";
import { ColorModeContext } from "../../contexts/color-mode";

import "/node_modules/flag-icons/css/flag-icons.min.css";
import { languages } from "../../i18n";

const { useToken } = theme;

export const Header: React.FC<RefineThemedLayoutV2HeaderProps> = ({
  sticky,
}) => {
  const { token } = useToken();
  const locale = useGetLocale();
  const changeLanguage = useSetLocale();
  const { mode, setMode } = useContext(ColorModeContext);

  const currentLocale = locale();

  const menuItems: MenuProps["items"] = [...(Object.keys(languages) || [])]
    .sort()
    .map((lang: string) => ({
      key: lang,
      onClick: () => changeLanguage(lang),
      icon: (
        <span
          className={"fi fi-" + languages[lang].countryCode}
          style={{ marginRight: 8 }}
        />
      ),
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
              <span
                className={
                  "fi fi-" + languages[currentLocale ?? "en"].countryCode
                }
              />
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
      </Space>
    </AntdLayout.Header>
  );
};
