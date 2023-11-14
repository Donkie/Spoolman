import React from "react";
import { IResourceComponentsProps } from "@refinedev/core";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { Content } from "antd/es/layout/layout";
import { Collapse, List, theme } from "antd";
import Title from "antd/es/typography/Title";
import Logo from "../../icon.svg?react";
import { FileOutlined, HighlightOutlined, UserOutlined } from "@ant-design/icons";

dayjs.extend(utc);

const { useToken } = theme;

export const Home: React.FC<IResourceComponentsProps> = () => {
  const { token } = useToken();
  // const t = useTranslate();

  return (
    <Content
      style={{
        padding: 8,
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
      <Title
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "1em 0",
          fontSize: token.fontSizeHeading1 + 8,
        }}
      >
        <div
          style={{
            display: "inline-block",
            height: "1.5em",
            float: "left",
            marginRight: "0.5em",
          }}
        >
          <Logo />
        </div>
        Spoolman
      </Title>
      <Collapse
        className="site-collapse-custom-collapse"
        items={[
          {
            key: "1",
            label: <span style={{ fontSize: "200%" }}>Getting Started</span>,
            children: (
              <>
                <p>Here are some tips to get you started.</p>
                <p>Spoolman holds 3 different types of data:</p>
                <List
                  itemLayout="horizontal"
                  size="large"
                  dataSource={[
                    {
                      title: "Filaments",
                      description:
                        "Brands of filament. They have properties such as name, material, color, diameter, and more.",
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
                  To enter a new spool into the database, you first need to create a <strong>Filament</strong> object
                  for it. Once that is done, you can then create a <strong>Spool</strong> object for that individual
                  spool. If you then purchase additional spools of the same filament, you can just create additional
                  Spool objects, and re-use the same Filament object.
                </p>
                <p>
                  You can optionally also create a <strong>Vendor</strong> object for the company that makes the
                  filament, if you want to track that information.
                </p>
                <p>
                  You can connect other 3D printer services to Spoolman, such as Moonraker, which can then automatically
                  track filament usage and update the Spool objects for you. See the{" "}
                  <a href="https://github.com/Donkie/Spoolman#integration-status" target="_blank">
                    Spoolman README
                  </a>{" "}
                  for how to do that.
                </p>
              </>
            ),
          },
        ]}
        bordered={false}
        ghost
      />
    </Content>
  );
};

export default Home;
