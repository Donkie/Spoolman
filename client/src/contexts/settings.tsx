import { RefineThemes } from "@refinedev/antd";
import { ConfigProvider, theme } from "antd";
import { createContext, PropsWithChildren } from "react";
import { useSavedState } from "../utils/saveload";

type Settings = {
  colorMode: "light" | "dark";
};

type SettingsContextType = {
  settings: Settings;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
};

const defaultSettings: Settings = {
  colorMode: window?.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
};

export const SettingsContext = createContext<SettingsContextType>({} as SettingsContextType);

export const SettingsContextProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const [settings, setSetting] = useSavedState("settings", defaultSettings);

  const { darkAlgorithm, defaultAlgorithm } = theme;

  return (
    <SettingsContext.Provider
      value={{
        setSetting: (key, value) => setSetting({ ...settings, [key]: value }),
        settings,
      }}
    >
      <ConfigProvider
        // you can change the theme colors here. example: ...RefineThemes.Magenta,
        theme={{
          ...RefineThemes.Yellow,
          algorithm: settings.colorMode === "light" ? defaultAlgorithm : darkAlgorithm,
        }}
      >
        {children}
      </ConfigProvider>
    </SettingsContext.Provider>
  );
};
