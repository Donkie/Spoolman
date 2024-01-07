import React from "react";
import { IResourceComponentsProps, useTranslate } from "@refinedev/core";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { Content } from "antd/es/layout/layout";
import { Menu, theme } from "antd";
import { SolutionOutlined, ToolOutlined } from "@ant-design/icons";
import { useSavedState } from "../../utils/saveload";
import { GenericSettings } from "./GenericSettings";
import { ExtraFieldsSettings } from "./ExtraFieldsSettings";

dayjs.extend(utc);

const { useToken } = theme;

export const Settings: React.FC<IResourceComponentsProps> = () => {
  const { token } = useToken();
  const t = useTranslate();
  const [current, setCurrent] = useSavedState("settings-tab", "generic");

  return (
    <>
      <h1
        style={{
          color: token.colorText,
        }}
      >
        {t("settings.header")}
      </h1>
      <Content
        style={{
          padding: "1em",
          minHeight: 280,
          margin: "0 auto",
          backgroundColor: token.colorBgContainer,
          borderRadius: token.borderRadiusLG,
          color: token.colorText,
          fontFamily: token.fontFamily,
          fontSize: token.fontSizeLG,
          lineHeight: 1.5,
        }}
      >
        <Menu
          mode="horizontal"
          selectedKeys={[current]}
          onClick={({ key }) => setCurrent(key)}
          items={[
            { key: "generic", label: t("settings.generic.tab"), icon: <ToolOutlined /> },
            { key: "extra", label: t("settings.extra_fields.tab"), icon: <SolutionOutlined /> },
          ]}
          style={{
            marginBottom: "3em",
          }}
        />
        <main>
          {current === "generic" && <GenericSettings />}
          {current === "extra" && <ExtraFieldsSettings />}
        </main>
      </Content>
    </>
  );
};

export default Settings;
