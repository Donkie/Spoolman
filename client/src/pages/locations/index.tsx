import { IResourceComponentsProps, useInvalidate, useList, useNavigation, useTranslate } from "@refinedev/core";
import { Button, theme } from "antd";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import type { Identifier, XYCoord } from "dnd-core";
import React, { useEffect, useMemo, useRef } from "react";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

import { DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import SpoolIcon from "../../components/spoolIcon";
import { useSetSetting } from "../../utils/querySettings";
import { ISpool } from "../spools/model";
import { setSpoolLocation, useLocations } from "./functions";
import "./locations.css";

dayjs.extend(utc);

const ItemTypes = {
  SPOOL: "spool",
  CONTAINER: "spool-container",
};

const { useToken } = theme;

function SpoolCard({ spool }: { spool: ISpool }) {
  const { token } = useToken();
  const t = useTranslate();
  const [{ opacity }, dragRef] = useDrag(
    () => ({
      type: ItemTypes.SPOOL,
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

function SpoolList({ location, spools }: { location: string; spools: ISpool[] }) {
  const { token } = useToken();
  const invalidate = useInvalidate();
  const [, spoolDrop] = useDrop(() => ({
    accept: ItemTypes.SPOOL,
    drop: (item: ISpool) => {
      setSpoolLocation(item.id, location).then(() => {
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
    <div className="loc-spools" ref={spoolDrop} style={style}>
      {spools.map((spool) => (
        <SpoolCard key={spool.id} spool={spool} />
      ))}
    </div>
  );
}

interface DragItem {
  index: number;
  title: string;
}

function LocationContainer({
  index,
  title,
  spools,
  showDelete,
  onDelete,
  moveLocation,
}: {
  index: number;
  title: string;
  spools: ISpool[];
  showDelete?: boolean;
  onDelete?: () => void;
  moveLocation: (dragIndex: number, hoverIndex: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [{ handlerId }, drop] = useDrop<DragItem, void, { handlerId: Identifier | null }>({
    accept: ItemTypes.CONTAINER,
    collect(monitor) {
      return {
        handlerId: monitor.getHandlerId(),
      };
    },
    hover(item, monitor) {
      if (!ref.current) {
        return null;
      }
      const dragIndex = item.index;
      const hoverIndex = index;

      // Don't replace items with themselves
      if (dragIndex === hoverIndex) {
        return;
      }

      // Determine rectangle on screen
      const hoverBoundingRect = ref.current?.getBoundingClientRect();

      // Get horizontal middle
      const hoverMiddleX = (hoverBoundingRect.right - hoverBoundingRect.left) / 2;

      // Determine mouse position
      const clientOffset = monitor.getClientOffset();

      // Get pixels to the left
      const hoverClientX = (clientOffset as XYCoord).x - hoverBoundingRect.left;

      // Dragging downwards
      if (dragIndex < hoverIndex && hoverClientX < hoverMiddleX) {
        return;
      }

      // Dragging upwards
      if (dragIndex > hoverIndex && hoverClientX > hoverMiddleX) {
        return;
      }

      // Time to actually perform the action
      moveLocation(dragIndex, hoverIndex);

      item.index = hoverIndex;
    },
  });

  const [{ isDragging }, drag] = useDrag({
    type: ItemTypes.CONTAINER,
    item: () => {
      return { title, index };
    },
    collect: (monitor: any) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const opacity = isDragging ? 0 : 1;
  drag(drop(ref));

  return (
    <div className="loc-container" ref={ref} style={{ opacity }} data-handler-id={handlerId}>
      <h3>
        <span>{title}</span>
        {showDelete && <Button icon={<DeleteOutlined />} size="small" type="text" onClick={onDelete} />}
      </h3>
      <SpoolList location={title} spools={spools} />
    </div>
  );
}

function LocationMetaContainer() {
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

  const moveLocation = (dragIndex: number, hoverIndex: number) => {
    const newLocs = [...locationsList];
    newLocs.splice(dragIndex, 1);
    newLocs.splice(hoverIndex, 0, locationsList[dragIndex]);
    console.log("newLocs", newLocs);
    setLocationsSetting.mutate(newLocs);
  };

  // Create containers
  const containers = locationsList.map((loc, idx) => {
    const spools = spoolLocations[loc] ?? [];
    return (
      <LocationContainer
        key={loc}
        index={idx}
        title={loc}
        spools={spools}
        showDelete={spools.length == 0}
        onDelete={() => {
          setLocationsSetting.mutate(locationsList.filter((l) => l !== loc));
        }}
        moveLocation={moveLocation}
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
  );
}

export const Locations: React.FC<IResourceComponentsProps> = () => {
  return (
    <DndProvider backend={HTML5Backend}>
      <LocationMetaContainer />
    </DndProvider>
  );
};

export default Locations;
