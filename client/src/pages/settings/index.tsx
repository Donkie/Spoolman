import React from "react";
import { IResourceComponentsProps, useTranslate } from "@refinedev/core";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { Content } from "antd/es/layout/layout";
import { Menu, theme } from "antd";
import { FileOutlined, HighlightOutlined, SolutionOutlined, ToolOutlined, UserOutlined } from "@ant-design/icons";
import { GeneralSettings } from "./GeneralSettings";
import { ExtraFieldsSettings } from "./ExtraFieldsSettings";
import { Route, Routes, useNavigate } from "react-router-dom";

dayjs.extend(utc);

const { useToken } = theme;

export const Settings: React.FC<IResourceComponentsProps> = () => {
  const { token } = useToken();
  const t = useTranslate();
  const navigate = useNavigate();

  const getCurrentKey = () => {
    const path = window.location.pathname.replace("/settings", "");
    // Remove starting slash and ending slash if exists and return
    return path.replace(/^\/|\/$/g, "");
  };

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
          selectedKeys={[getCurrentKey()]}
          onClick={(e) => {
            if (e.key === "") {
              return navigate("/settings");
            } else {
              return navigate(`/settings/${e.key}`);
            }
          }}
          items={[
            { key: "", label: t("settings.general.tab"), icon: <ToolOutlined /> },
            {
              key: "extra",
              label: t("settings.extra_fields.tab"),
              icon: <SolutionOutlined />,
              children: [
                {
                  label: t("spool.spool"),
                  key: "extra/spool",
                  icon: <FileOutlined />,
                },
                {
                  label: t("filament.filament"),
                  key: "extra/filament",
                  icon: <HighlightOutlined />,
                },
                {
                  label: t("vendor.vendor"),
                  key: "extra/vendor",
                  icon: <UserOutlined />,
                },
              ],
            },
          ]}
          style={{
            marginBottom: "1em",
          }}
        />
        <main>
          <Routes>
            <Route index element={<GeneralSettings />} />
            <Route path="/extra/:entityType" element={<ExtraFieldsSettings />} />
          </Routes>
        </main>
      </Content>
    </>
  );
};

export default Settings;
