import React from "react";
import { IResourceComponentsProps } from "@refinedev/core";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { Content } from "antd/es/layout/layout";
import { List, theme } from "antd";
import Title from "antd/es/typography/Title";
import { FileOutlined, HighlightOutlined, UserOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";

dayjs.extend(utc);

const { useToken } = theme;

export const Help: React.FC<IResourceComponentsProps> = () => {
  const { token } = useToken();
  // const t = useTranslate();

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
      <Title>Help</Title>
      <p>Here are some tips to get you started.</p>
      <p>Spoolman holds 3 different types of data:</p>
      <List
        itemLayout="horizontal"
        size="large"
        dataSource={[
          {
            title: "Filaments",
            description: "Brands of filament. They have properties such as name, material, color, diameter, and more.",
            icon: <HighlightOutlined />,
          },
          {
            title: "Spools",
            description: "Individual physical spools of a specific filament.",
            icon: <FileOutlined />,
          },
          {
            title: "Vendors",
            description: "The companies that make the filament.",
            icon: <UserOutlined />,
          },
        ]}
        renderItem={(item) => (
          <List.Item>
            <List.Item.Meta avatar={item.icon} title={item.title} description={item.description} />
          </List.Item>
        )}
      />
      <p>
        To enter a new spool into the database, you first need to create a <Link to="/filament/create">Filament</Link>{" "}
        object for it. Once that is done, you can then create a <Link to="/spool/create">Spool</Link> object for that
        individual spool. If you then purchase additional spools of the same filament, you can just create additional
        Spool objects, and re-use the same Filament object.
      </p>
      <p>
        You can optionally also create a <Link to="/vendor/create">Vendor</Link> object for the company that makes the
        filament, if you want to track that information.
      </p>
      <p>
        You can connect other 3D printer services to Spoolman, such as Moonraker, which can then automatically track
        filament usage and update the Spool objects for you. See the{" "}
        <a href="https://github.com/Donkie/Spoolman#integration-status" target="_blank">
          Spoolman README
        </a>{" "}
        for how to do that.
      </p>
    </Content>
  );
};

export default Help;
