import { FileOutlined, HighlightOutlined, UserOutlined } from "@ant-design/icons";
import { IResourceComponentsProps, useTranslate } from "@refinedev/core";
import { List, theme } from "antd";
import { Content } from "antd/es/layout/layout";
import Title from "antd/es/typography/Title";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import React from "react";
import { Trans } from "react-i18next";
import { Link } from "react-router-dom";

dayjs.extend(utc);

const { useToken } = theme;

export const Help: React.FC<IResourceComponentsProps> = () => {
  const { token } = useToken();
  const t = useTranslate();

  return (
    <Content
      style={{
        padding: 20,
        minHeight: 280,
        maxWidth: 1000,
        margin: "0 auto",
        backgroundColor: token.colorBgContainer,
        borderRadius: token.borderRadiusLG,
        color: token.colorText,
        fontFamily: token.fontFamily,
        fontSize: token.fontSizeLG,
        lineHeight: 1.5,
      }}
    >
      <Trans
        i18nKey={"help.description"}
        components={{
          p: <p />,
          title: <Title />,
          filamentCreateLink: <Link to="/filament/create" />,
          spoolCreateLink: <Link to="/spool/create" />,
          vendorCreateLink: <Link to="/vendor/create" />,
          readmeLink: <Link to="https://github.com/Donkie/Spoolman#integration-status" target="_blank" />,
          itemsHelp: (
            <List
              itemLayout="horizontal"
              size="large"
              dataSource={[
                {
                  title: t("filament.filament"),
                  description: t("help.resources.filament"),
                  icon: <HighlightOutlined />,
                },
                {
                  title: t("spool.spool"),
                  description: t("help.resources.spool"),
                  icon: <FileOutlined />,
                },
                {
                  title: t("vendor.vendor"),
                  description: t("help.resources.vendor"),
                  icon: <UserOutlined />,
                },
              ]}
              renderItem={(item) => (
                <List.Item>
                  <List.Item.Meta avatar={item.icon} title={item.title} description={item.description} />
                </List.Item>
              )}
            />
          ),
        }}
      />
    </Content>
  );
};

export default Help;
