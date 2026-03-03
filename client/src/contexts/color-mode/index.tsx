import { ConfigProvider, theme } from "antd";
import { createContext, PropsWithChildren, useEffect, useState } from "react";

type ColorModeContextType = {
  mode: string;
  setMode: (mode: string) => void;
};

export const ColorModeContext = createContext<ColorModeContextType>({} as ColorModeContextType);

export const ColorModeContextProvider = ({ children }: PropsWithChildren) => {
  const colorModeFromLocalStorage = localStorage.getItem("colorMode");
  const isSystemPreferenceDark = window?.matchMedia("(prefers-color-scheme: dark)").matches;

  const systemPreference = isSystemPreferenceDark ? "dark" : "light";
  const [mode, setMode] = useState(colorModeFromLocalStorage || systemPreference);

  useEffect(() => {
    window.localStorage.setItem("colorMode", mode);
  }, [mode]);

  const setColorMode = () => {
    if (mode === "light") {
      setMode("dark");
    } else {
      setMode("light");
    }
  };

  const { darkAlgorithm, defaultAlgorithm } = theme;
  // Apply the scrollbar theme globally in dark mode because many scroll containers come from
  // nested Ant components/popup portals, so local component-level overrides miss large parts of
  // the UI. The light theme keeps native scrollbars unchanged.
  const darkScrollbarCss = `
    html, body, body * {
      scrollbar-width: thin;
      scrollbar-color: rgba(255, 255, 255, 0.22) rgba(255, 255, 255, 0.06);
    }

    html::-webkit-scrollbar,
    body::-webkit-scrollbar,
    body *::-webkit-scrollbar {
      width: 10px;
      height: 10px;
    }

    html::-webkit-scrollbar-track,
    body::-webkit-scrollbar-track,
    body *::-webkit-scrollbar-track {
      background: rgba(255, 255, 255, 0.06);
      border-radius: 999px;
    }

    html::-webkit-scrollbar-thumb,
    body::-webkit-scrollbar-thumb,
    body *::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.22);
      border-radius: 999px;
      border: 2px solid rgba(0, 0, 0, 0);
      background-clip: padding-box;
    }

    html::-webkit-scrollbar-thumb:hover,
    body::-webkit-scrollbar-thumb:hover,
    body *::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.3);
      background-clip: padding-box;
    }
  `;

  return (
    <ColorModeContext.Provider
      value={{
        setMode: setColorMode,
        mode,
      }}
    >
      {mode === "dark" && <style>{darkScrollbarCss}</style>}
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
