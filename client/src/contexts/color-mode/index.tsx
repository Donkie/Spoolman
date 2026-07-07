import { ConfigProvider, theme } from "antd";
import { createContext, PropsWithChildren, useEffect, useState } from "react";

export type ThemePreference = "system" | "light" | "dark";
type ResolvedMode = "light" | "dark";

type ColorModeContextType = {
  // The effective theme actually applied ("light" | "dark").
  mode: ResolvedMode;
  // The user's chosen preference; "system" follows the OS/browser setting live.
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
};

export const ColorModeContext = createContext<ColorModeContextType>({} as ColorModeContextType);

const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

const isThemePreference = (value: string | null): value is ThemePreference =>
  value === "system" || value === "light" || value === "dark";

const getSystemMode = (): ResolvedMode => (window?.matchMedia(DARK_MEDIA_QUERY).matches ? "dark" : "light");

export const ColorModeContextProvider = ({ children }: PropsWithChildren) => {
  // Legacy versions stored the resolved "light"/"dark" here, which are still valid
  // preference values, so existing users keep whatever they had. New/unset installs
  // default to "system" so the app follows the OS/browser theme (issue #947).
  const storedPreference = localStorage.getItem("colorMode");
  const [preference, setPreferenceState] = useState<ThemePreference>(
    isThemePreference(storedPreference) ? storedPreference : "system",
  );

  const [systemMode, setSystemMode] = useState<ResolvedMode>(getSystemMode);

  // Keep tracking the OS/browser theme so "system" reacts to changes at runtime.
  useEffect(() => {
    const media = window.matchMedia(DARK_MEDIA_QUERY);
    const handler = (event: MediaQueryListEvent) => setSystemMode(event.matches ? "dark" : "light");
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, []);

  const setPreference = (next: ThemePreference) => {
    setPreferenceState(next);
    window.localStorage.setItem("colorMode", next);
  };

  const mode: ResolvedMode = preference === "system" ? systemMode : preference;

  const { darkAlgorithm, defaultAlgorithm } = theme;

  return (
    <ColorModeContext.Provider
      value={{
        mode,
        preference,
        setPreference,
      }}
    >
      <ConfigProvider
        // you can change the theme colors here. example: ...RefineThemes.Magenta,
        theme={{
          algorithm: mode === "light" ? defaultAlgorithm : darkAlgorithm,
          token: {
            colorPrimary: "#dc7734",
          },
        }}
      >
        {children}
      </ConfigProvider>
    </ColorModeContext.Provider>
  );
};
