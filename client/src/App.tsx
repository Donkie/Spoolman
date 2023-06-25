import { Refine } from "@refinedev/core";
import { RefineKbar, RefineKbarProvider } from "@refinedev/kbar";

import {
  ErrorComponent,
  notificationProvider,
  ThemedLayoutV2,
  ThemedSiderV2,
  ThemedTitleV2,
} from "@refinedev/antd";
import "@refinedev/antd/dist/reset.css";

import routerBindings, {
  NavigateToResource,
  UnsavedChangesNotifier,
} from "@refinedev/react-router-v6";
import dataProvider from "@refinedev/simple-rest";
import { useTranslation } from "react-i18next";
import { BrowserRouter, Outlet, Route, Routes } from "react-router-dom";
import { Header } from "./components/header";
import { ColorModeContextProvider } from "./contexts/color-mode";
import { SpoolCreate, SpoolEdit, SpoolList, SpoolShow } from "./pages/spools";
import {
  FilamentCreate,
  FilamentEdit,
  FilamentList,
  FilamentShow,
} from "./pages/filaments";
import {
  VendorCreate,
  VendorEdit,
  VendorList,
  VendorShow,
} from "./pages/vendors";
import { ReactComponent as Logo } from "./icon.svg";
import {
  FileOutlined,
  HighlightOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { ConfigProvider } from "antd";

function App() {
  const { t, i18n } = useTranslation();

  const i18nProvider = {
    translate: (key: string, params: object) => t(key, params),
    changeLocale: (lang: string) => i18n.changeLanguage(lang),
    getLocale: () => i18n.language,
  };

  if (!import.meta.env.VITE_APIURL) {
    return (
      <>
        <h1>Missing API URL</h1>
        <p>
          App was built without an API URL. Please set the VITE_APIURL
          environment variable to the URL of your Spoolman API.
        </p>
      </>
    );
  }

  return (
    <BrowserRouter>
      <RefineKbarProvider>
        <ColorModeContextProvider>
          <ConfigProvider
            theme={{
              token: {
                colorPrimary: "#dc7734",
              },
            }}
          >
            <Refine
              dataProvider={dataProvider(import.meta.env.VITE_APIURL)}
              notificationProvider={notificationProvider}
              i18nProvider={i18nProvider}
              routerProvider={routerBindings}
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
              }}
            >
              <Routes>
                <Route
                  element={
                    <ThemedLayoutV2
                      Header={() => <Header sticky />}
                      Sider={() => (
                        <ThemedSiderV2
                          fixed
                          Title={({ collapsed }) => (
                            <ThemedTitleV2
                              collapsed={collapsed}
                              text="Spoolman"
                              icon={<Logo />}
                            />
                          )}
                        />
                      )}
                    >
                      <Outlet />
                    </ThemedLayoutV2>
                  }
                >
                  <Route
                    index
                    element={<NavigateToResource resource="spool" />}
                  />
                  <Route path="/spool">
                    <Route index element={<SpoolList />} />
                    <Route
                      path="create"
                      element={<SpoolCreate mode="create" />}
                    />
                    <Route
                      path="clone/:id"
                      element={<SpoolCreate mode="clone" />}
                    />
                    <Route path="edit/:id" element={<SpoolEdit />} />
                    <Route path="show/:id" element={<SpoolShow />} />
                  </Route>
                  <Route path="/filament">
                    <Route index element={<FilamentList />} />
                    <Route
                      path="create"
                      element={<FilamentCreate mode="create" />}
                    />
                    <Route
                      path="clone/:id"
                      element={<FilamentCreate mode="clone" />}
                    />
                    <Route path="edit/:id" element={<FilamentEdit />} />
                    <Route path="show/:id" element={<FilamentShow />} />
                  </Route>
                  <Route path="/vendor">
                    <Route index element={<VendorList />} />
                    <Route path="create" element={<VendorCreate />} />
                    <Route path="edit/:id" element={<VendorEdit />} />
                    <Route path="show/:id" element={<VendorShow />} />
                  </Route>
                  <Route path="*" element={<ErrorComponent />} />
                </Route>
              </Routes>

              <RefineKbar />
              <UnsavedChangesNotifier />
            </Refine>
          </ConfigProvider>
        </ColorModeContextProvider>
      </RefineKbarProvider>
    </BrowserRouter>
  );
}

export default App;
