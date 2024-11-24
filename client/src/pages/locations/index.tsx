import { IResourceComponentsProps, useTranslate } from "@refinedev/core";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import React from "react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

import { LocationContainer } from "./components/locationContainer";
import "./locations.css";

dayjs.extend(utc);

export const Locations: React.FC<IResourceComponentsProps> = () => {
  const t = useTranslate();
  return (
    <div>
      <h1>{t("locations.locations")}</h1>
      <DndProvider backend={HTML5Backend}>
        <LocationContainer />
      </DndProvider>
    </div>
  );
};

export default Locations;
