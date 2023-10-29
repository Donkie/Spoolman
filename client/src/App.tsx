import { Refine } from "@refinedev/core";
import { RefineKbar, RefineKbarProvider } from "@refinedev/kbar";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

import { ErrorComponent } from "@refinedev/antd";
import "@refinedev/antd/dist/reset.css";

import routerBindings, {
  DocumentTitleHandler,
  NavigateToResource,
  UnsavedChangesNotifier,
} from "@refinedev/react-router-v6";
import dataProvider from "./components/dataProvider";
import { useTranslation } from "react-i18next";
import { BrowserRouter, Outlet, Route, Routes } from "react-router-dom";
import { ColorModeContextProvider } from "./contexts/color-mode";
import { FileOutlined, HighlightOutlined, UserOutlined } from "@ant-design/icons";
import { ConfigProvider } from "antd";
import React from "react";
import { Locale } from "antd/es/locale";
import { languages } from "./i18n";
import loadable from "@loadable/component";
import SpoolmanNotificationProvider from "./components/notificationProvider";
import { SpoolmanLayout } from "./components/layout";
import liveProvider from "./components/liveProvider";

interface PageProps {
  resource: "spools" | "filaments" | "vendors";
  page: "list" | "create" | "edit" | "show";
  mode?: "create" | "clone";
}

const LoadablePage = loadable((props: PageProps) => import(`./pages/${props.resource}/${props.page}.tsx`), {
  fallback: <div>Page is Loading...</div>,
  cacheKey: (props: PageProps) => `${props.resource}-${props.page}-${props.mode ?? ""}`,
});

function App() {
  const { t, i18n } = useTranslation();

  const i18nProvider = {
    translate: (key: string, params?: never) => t(key, params),
    changeLocale: (lang: string) => i18n.changeLanguage(lang),
    getLocale: () => i18n.language,
  };

  // Fetch the antd locale using dynamic imports
  const [antdLocale, setAntdLocale] = React.useState<Locale | undefined>();
  React.useEffect(() => {
    const fetchLocale = async () => {
      const locale = await import(
        `./../node_modules/antd/es/locale/${languages[i18n.language].fullCode.replace("-", "_")}.js`
      );
      setAntdLocale(locale.default);
    };
    fetchLocale().catch(console.error);
  }, [i18n.language]);

  if (!import.meta.env.VITE_APIURL) {
    return (
      <>
        <h1>Missing API URL</h1>
        <p>
          App was built without an API URL. Please set the VITE_APIURL environment variable to the URL of your Spoolman
          API.
        </p>
      </>
    );
  }

  return (
    <BrowserRouter>
      <RefineKbarProvider>
        <ColorModeContextProvider>
          <ConfigProvider
            locale={antdLocale}
            theme={{
              token: {
                colorPrimary: "#dc7734",
              },
            }}
          >
            <Refine
              dataProvider={dataProvider(import.meta.env.VITE_APIURL)}
              notificationProvider={SpoolmanNotificationProvider}
              i18nProvider={i18nProvider}
              routerProvider={routerBindings}
              liveProvider={liveProvider(import.meta.env.VITE_APIURL)}
              resources={[
                {
                  name: "spool",
                  list: "/spool",
                  create: "/spool/create",
                  clone: "/spool/clone/:id",
                  edit: "/spool/edit/:id",
                  show: "/spool/show/:id",
                  meta: {
                    canDelete: true,
                    icon: <FileOutlined />,
                  },
                },
                {
                  name: "filament",
                  list: "/filament",
                  create: "/filament/create",
                  clone: "/filament/clone/:id",
                  edit: "/filament/edit/:id",
                  show: "/filament/show/:id",
                  meta: {
                    canDelete: true,
                    icon: <HighlightOutlined />,
                  },
                },
                {
                  name: "vendor",
                  list: "/vendor",
                  create: "/vendor/create",
                  clone: "/vendor/clone/:id",
                  edit: "/vendor/edit/:id",
                  show: "/vendor/show/:id",
                  meta: {
                    canDelete: true,
                    icon: <UserOutlined />,
                  },
                },
              ]}
              options={{
                syncWithLocation: true,
                warnWhenUnsavedChanges: true,
                disableTelemetry: true,
              }}
            >
              <Routes>
                <Route
                  element={
                    <SpoolmanLayout>
                      <Outlet />
                    </SpoolmanLayout>
                  }
                >
                  <Route index element={<NavigateToResource resource="spool" />} />
                  <Route path="/spool">
                    <Route index element={<LoadablePage resource="spools" page="list" />} />
                    <Route path="create" element={<LoadablePage resource="spools" page="create" mode="create" />} />
                    <Route path="clone/:id" element={<LoadablePage resource="spools" page="create" mode="clone" />} />
                    <Route path="edit/:id" element={<LoadablePage resource="spools" page="edit" />} />
                    <Route path="show/:id" element={<LoadablePage resource="spools" page="show" />} />
                  </Route>
                  <Route path="/filament">
                    <Route index element={<LoadablePage resource="filaments" page="list" />} />
                    <Route path="create" element={<LoadablePage resource="filaments" page="create" mode="create" />} />
                    <Route
                      path="clone/:id"
                      element={<LoadablePage resource="filaments" page="create" mode="clone" />}
                    />
                    <Route path="edit/:id" element={<LoadablePage resource="filaments" page="edit" />} />
                    <Route path="show/:id" element={<LoadablePage resource="filaments" page="show" />} />
                  </Route>
                  <Route path="/vendor">
                    <Route index element={<LoadablePage resource="vendors" page="list" />} />
                    <Route path="create" element={<LoadablePage resource="vendors" page="create" mode="create" />} />
                    <Route path="clone/:id" element={<LoadablePage resource="vendors" page="create" mode="clone" />} />
                    <Route path="edit/:id" element={<LoadablePage resource="vendors" page="edit" />} />
                    <Route path="show/:id" element={<LoadablePage resource="vendors" page="show" />} />
                  </Route>
                  <Route path="*" element={<ErrorComponent />} />
                </Route>
              </Routes>

              <RefineKbar />
              <UnsavedChangesNotifier />
              <DocumentTitleHandler />
              <ReactQueryDevtools />
            </Refine>
          </ConfigProvider>
        </ColorModeContextProvider>
      </RefineKbarProvider>
    </BrowserRouter>
  );
}

export default App;
