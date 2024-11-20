import { IResourceComponentsProps, useInvalidate, useList, useNavigation, useTranslate } from "@refinedev/core";
import { Button, theme } from "antd";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import React, { useEffect, useMemo } from "react";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

import { DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import SpoolIcon from "../../components/spoolIcon";
import { useGetSetting, useSetSetting } from "../../utils/querySettings";
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

function LocationContainer({
  title,
  spools,
  showDelete,
  onDelete,
}: {
  title: string;
  spools: ISpool[];
  showDelete?: boolean;
  onDelete?: () => void;
}) {
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
      <h3>
        <span>{title}</span>
        {showDelete && <Button icon={<DeleteOutlined />} size="small" type="text" onClick={onDelete} />}
      </h3>
      <div className="loc-spools" ref={drop} style={style}>
        {spools.map((spool) => (
          <SpoolCard key={spool.id} spool={spool} />
        ))}
      </div>
    </div>
  );
}

function useLocations(): string[] {
  const query = useGetSetting("locations");

  return useMemo(() => {
    if (!query.data) return [];

    try {
      return JSON.parse(query.data.value) as string[];
    } catch {
      console.warn("Failed to parse locations", query.data.value);
      return [];
    }
  }, [query.data]);
}

export const Locations: React.FC<IResourceComponentsProps> = () => {
  const t = useTranslate();

  const settingsLocations = useLocations();
  const setLocationsSetting = useSetSetting<string[]>("locations");

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

  // Grab spools and sort by ID
  const spools = data?.data ?? [];
  spools.sort((a, b) => a.id - b.id);

  // Group spools by location
  const spoolLocations = useMemo(() => {
    const grouped: Record<string, ISpool[]> = {};
    spools.forEach((spool) => {
      const loc = spool.location ?? t("spool.no_location");
      if (!grouped[loc]) {
        grouped[loc] = [];
      }
      grouped[loc].push(spool);
    });
    return grouped;
  }, [spools]);

  // Create list of locations that's sorted
  const locationsList = useMemo(() => {
    // Start with the locations setting
    let allLocs = settingsLocations;
    console.log("settingsLocations", settingsLocations);

    // Add any missing locations from the spools
    for (const loc of Object.keys(spoolLocations)) {
      if (!allLocs.includes(loc)) {
        allLocs.push(loc);
      }
    }

    return allLocs;
  }, [spoolLocations, settingsLocations]);

  // Create containers
  const containers = locationsList.map((loc) => {
    const spools = spoolLocations[loc] ?? [];
    return (
      <LocationContainer
        key={loc}
        title={loc}
        spools={spools}
        showDelete={spools.length == 0}
        onDelete={() => {
          setLocationsSetting.mutate(locationsList.filter((l) => l !== loc));
        }}
      />
    );
  });

  // Update locations settings so it always includes all spool locations
  useEffect(() => {
    // Check if they're not the same
    if (JSON.stringify(locationsList) !== JSON.stringify(settingsLocations)) {
      console.log("Updating locations settings", locationsList, settingsLocations);
      setLocationsSetting.mutate(locationsList);
    }
  }, [spoolLocations]);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (isError) {
    return <div>Failed to load spools</div>;
  }

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="loc-metacontainer">
        {containers}
        <div className="newLocContainer">
          <Button
            type="dashed"
            shape="circle"
            icon={<PlusOutlined />}
            size="large"
            style={{
              margin: "1em",
            }}
            onClick={() => setLocationsSetting.mutate([...settingsLocations, "New Location"])}
          />
        </div>
      </div>
    </DndProvider>
  );
};

export default Locations;
