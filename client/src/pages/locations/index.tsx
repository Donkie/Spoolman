import { IResourceComponentsProps, useInvalidate, useList, useNavigation, useTranslate } from "@refinedev/core";
import { Button, theme } from "antd";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import React from "react";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

import { EditOutlined, EyeOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import SpoolIcon from "../../components/spoolIcon";
import { ISpool } from "../spools/model";
import { setSpoolLocation } from "./functions";
import "./locations.css";

dayjs.extend(utc);

const { useToken } = theme;

function SpoolCard({ spool }: { spool: ISpool }) {
  const { token } = useToken();
  const t = useTranslate();
  const [{ opacity }, dragRef] = useDrag(
    () => ({
      type: "spool",
      item: spool,
      collect: (monitor) => ({
        opacity: monitor.isDragging() ? 0.5 : 1,
      }),
    }),
    []
  );
  const { editUrl, showUrl } = useNavigation();

  const colorObj = spool.filament.multi_color_hexes
    ? {
        colors: spool.filament.multi_color_hexes.split(","),
        vertical: spool.filament.multi_color_direction === "longitudinal",
      }
    : spool.filament.color_hex || "#000000";

  let filament_name: string;
  if (spool.filament.vendor && "name" in spool.filament.vendor) {
    filament_name = `${spool.filament.vendor.name} - ${spool.filament.name}`;
  } else {
    filament_name = spool.filament.name ?? spool.filament.id.toString();
  }

  const style = {
    opacity,
    backgroundColor: token.colorBgContainerDisabled,
  };

  return (
    <div className="spool" ref={dragRef} style={style}>
      <SpoolIcon color={colorObj} />
      <div className="info">
        <div className="title">
          <span>
            #{spool.id} {filament_name}
          </span>
          <div>
            <Link to={editUrl("spool", spool.id)}>
              <Button icon={<EditOutlined />} title={t("buttons.edit")} size="small" type="text" />
            </Link>
            <Link to={showUrl("spool", spool.id)}>
              <Button icon={<EyeOutlined />} title={t("buttons.show")} size="small" type="text" />
            </Link>
          </div>
        </div>
        <div
          className="subtitle"
          style={{
            color: token.colorTextSecondary,
          }}
        >
          {spool.remaining_weight} / {spool.filament.weight} g
        </div>
      </div>
    </div>
  );
}

function LocationContainer({ title, spools }: { title: string; spools: ISpool[] }) {
  const { token } = useToken();
  const invalidate = useInvalidate();

  const [, drop] = useDrop(() => ({
    accept: "spool",
    drop: (item: ISpool) => {
      setSpoolLocation(item.id, title).then(() => {
        invalidate({
          resource: "spool",
          id: item.id,
          invalidates: ["list", "detail"],
        });
      });
    },
  }));

  const style = {
    backgroundColor: token.colorBgContainer,
    borderRadius: token.borderRadiusLG,
  };

  return (
    <div className="loc-container">
      <h3>{title}</h3>
      <div className="loc-spools" ref={drop} style={style}>
        {spools.map((spool) => (
          <SpoolCard key={spool.id} spool={spool} />
        ))}
      </div>
    </div>
  );
}

export const Locations: React.FC<IResourceComponentsProps> = () => {
  const t = useTranslate();

  const { data, isLoading, isError } = useList<ISpool>({
    resource: "spool",
    meta: {
      queryParams: {
        ["allow_archived"]: false,
      },
    },
    pagination: {
      mode: "off",
    },
  });

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (isError) {
    return <div>Failed to load spools</div>;
  }

  const spools = data?.data ?? [];
  spools.sort((a, b) => a.id - b.id);

  // Locations is all the unique locations of the spools
  const spoolLocations: Record<string, ISpool[]> = {};
  spools.forEach((spool) => {
    const loc = spool.location ?? t("spool.no_location");
    if (!spoolLocations[loc]) {
      spoolLocations[loc] = [];
    }
    spoolLocations[loc].push(spool);
  });

  const locationsList = Object.keys(spoolLocations);
  locationsList.sort((a, b) => {
    return a.localeCompare(b);
  });

  const containers = locationsList.map((loc) => {
    return <LocationContainer key={loc} title={loc} spools={spoolLocations[loc]} />;
  });

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="loc-metacontainer">{containers}</div>
    </DndProvider>
  );
};

export default Locations;
