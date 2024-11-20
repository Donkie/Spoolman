import { IResourceComponentsProps } from "@refinedev/core";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import React from "react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

import { LocationContainer } from "./components/locationContainer";
import "./locations.css";

dayjs.extend(utc);

export const Locations: React.FC<IResourceComponentsProps> = () => {
  return (
    <DndProvider backend={HTML5Backend}>
      <LocationContainer />
    </DndProvider>
  );
};

export default Locations;
