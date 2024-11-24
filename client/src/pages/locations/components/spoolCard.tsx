import { useNavigation, useTranslate, useUpdate } from "@refinedev/core";
import { Button, theme } from "antd";
import type { Identifier, XYCoord } from "dnd-core";
import { useDrag, useDrop } from "react-dnd";

import { EditOutlined, EyeOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import utc from "dayjs/plugin/utc";
import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import SpoolIcon from "../../../components/spoolIcon";
import { ISpool } from "../../spools/model";
import { ItemTypes, SpoolDragItem, useCurrentDraggedSpool } from "../dnd";

dayjs.extend(utc);
dayjs.extend(relativeTime);

const { useToken } = theme;

export function SpoolCard({
  index,
  spool,
  moveSpoolOrder,
}: {
  index: number;
  spool: ISpool;
  moveSpoolOrder: (dragIndex: number, hoverIndex: number) => void;
}) {
  const { token } = useToken();
  const t = useTranslate();
  const { editUrl, showUrl } = useNavigation();

  // Using a global state for this, because the drag handlers are reset when the spool changes location
  const { draggedSpoolId, setDraggedSpoolId } = useCurrentDraggedSpool();

  const { mutate: updateSpool } = useUpdate({
    resource: "spool",
    mutationMode: "optimistic",
    successNotification: false,
  });

  const moveSpoolLocation = (spool_id: number, location: string) => {
    updateSpool({
      id: spool_id,
      values: {
        location: location,
      },
    });
  };

  const ref = useRef<HTMLDivElement>(null);
  const [{ handlerId }, drop] = useDrop<SpoolDragItem, void, { handlerId: Identifier | null }>({
    accept: ItemTypes.SPOOL,
    collect(monitor) {
      return {
        handlerId: monitor.getHandlerId(),
      };
    },
    hover(item, monitor) {
      if (!ref.current || item.spool.id === spool.id) {
        return null;
      }

      if (item.spool.location !== spool.location && spool.location) {
        moveSpoolLocation(item.spool.id, spool.location);
        item.spool.location = spool.location;
        return;
      }

      const dragIndex = item.index;
      const hoverIndex = index;

      // Determine rectangle on screen
      const hoverBoundingRect = ref.current?.getBoundingClientRect();

      // Get horizontal middle
      const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;

      // Determine mouse position
      const clientOffset = monitor.getClientOffset();

      // Get pixels to the top
      const hoverClientY = (clientOffset as XYCoord).y - hoverBoundingRect.top;

      // Dragging downwards
      if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) {
        return;
      }

      // Dragging upwards
      if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) {
        return;
      }

      // Time to actually perform the action
      moveSpoolOrder(item.spool.id, hoverIndex);

      item.index = hoverIndex;
    },
  });

  const [{ isDragging }, drag] = useDrag({
    type: ItemTypes.SPOOL,
    item: () => {
      return { spool, index };
    },
    collect: (monitor: any) => ({
      isDragging: monitor.isDragging(),
    }),
    end() {
      setDraggedSpoolId(-1);
    },
  });

  useEffect(() => {
    if (isDragging) {
      setDraggedSpoolId(spool.id);
    }
  }, [isDragging]);

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

  const opacity = draggedSpoolId === spool.id ? 0 : 1;
  const style = {
    opacity,
    backgroundColor: token.colorBgContainerDisabled,
  };
  drag(drop(ref));

  function formatSubtitle(spool: ISpool) {
    let str = "";
    if (spool.filament.material) str += spool.filament.material + " - ";
    if (spool.filament.weight) {
      const remaining_weight = spool.remaining_weight ?? spool.filament.weight;
      str += `${remaining_weight} / ${spool.filament.weight} g`;
    }
    if (spool.last_used) {
      // Format like "last used X time ago"
      const dt = dayjs(spool.last_used);
      str += ` - ${t("spool.formats.last_used", { date: dt.fromNow() })}`;
    }
    return str;
  }

  return (
    <div className="spool" ref={ref} style={style} data-handler-id={handlerId}>
      <SpoolIcon color={colorObj} />
      <div className="info">
        <div className="title">
          <span>
            #{spool.id} {filament_name}
          </span>
          <div>
            <Link to={`/spool/edit/${spool.id}?return=` + encodeURIComponent(window.location.pathname)}>
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
          {formatSubtitle(spool)}
        </div>
      </div>
    </div>
  );
}
