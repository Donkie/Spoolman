import { ThemedLayout, ThemedSider, ThemedTitle } from "@refinedev/antd";
import { Menu } from "antd";
import React from "react";
import Logo from "../icon.svg?react";
import { Header } from "./header";

import "./layout.css";

export const SpoolmanLayout = ({ children }: { children: React.ReactNode }) => (
  <div className="spoolman-root">
  <ThemedLayout
    Header={() => <Header sticky />}
    Sider={() => (
      <ThemedSider
        fixed
        Title={({ collapsed }) => <ThemedTitle collapsed={collapsed} text="Spoolman" icon={<Logo />} />}
        render={({ items, logout, collapsed }) => {
          const bottomKeys = ["/settings", "/help"];
          const mainItems: React.ReactNode[] = [];
          const bottomItems: React.ReactNode[] = [];

          React.Children.forEach(items as React.ReactNode, (child) => {
            if (!React.isValidElement(child)) return;
            const key = String(child.key ?? "");
            if (bottomKeys.some((k) => key.includes(k))) {
              bottomItems.push(child);
            } else {
              mainItems.push(child);
            }
          });

          return (
            <>
              {mainItems}
              <li style={{ flex: 1 }} />
              <Menu.Divider style={{ margin: "0 16px 4px" }} />
              {bottomItems}
              {logout}
            </>
          );
        }}
      />
    )}
  >
    {children}
  </ThemedLayout>
  </div>
);
