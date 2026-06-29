import { PlusOutlined } from "@ant-design/icons";
import { List } from "@refinedev/antd";
import { useTranslate } from "@refinedev/core";
import { Button } from "antd";
import { useState } from "react";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

import { LocationContainer } from "./components/locationContainer";
import "./locations.css";

dayjs.extend(utc);

export const Locations = () => {
  const t = useTranslate();
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <List
      headerButtons={() => (
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
          {t("locations.new_location")}
        </Button>
      )}
    >
      <DndProvider backend={HTML5Backend}>
        <LocationContainer modalOpen={modalOpen} setModalOpen={setModalOpen} />
      </DndProvider>
    </List>
  );
};

export default Locations;
