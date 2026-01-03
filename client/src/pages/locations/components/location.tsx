import { Button, Input, theme } from "antd";
import type { Identifier, XYCoord } from "dnd-core";
import { useRef, useState } from "react";
import { useDrag, useDrop } from "react-dnd";

import { DeleteOutlined } from "@ant-design/icons";
import { useTranslate, useUpdate } from "@refinedev/core";
import { ISpool } from "../../spools/model";
import { DragItem, ItemTypes, SpoolDragItem } from "../dnd";
import { EMPTYLOC } from "../functions";
import { SpoolList } from "./spoolList";
import { useGetSetting } from "../../../utils/querySettings";

const { useToken } = theme;

export function Location({
  index,
  title,
  spools,
  showDelete,
  onDelete,
  moveLocation,
  onEditTitle,
  locationSpoolOrder,
  setLocationSpoolOrder,
}: {
  index: number;
  title: string;
  spools: ISpool[];
  showDelete?: boolean;
  onDelete?: () => void;
  moveLocation: (dragIndex: number, hoverIndex: number) => void;
  onEditTitle: (newTitle: string) => void;
  locationSpoolOrder: number[];
  setLocationSpoolOrder: (spoolOrder: number[]) => void;
}) {
  const { token } = useToken();
  const t = useTranslate();
  const [editTitle, setEditTitle] = useState(false);
  const [newTitle, setNewTitle] = useState(title);
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

  const dropTypes = title == EMPTYLOC ? [ItemTypes.SPOOL] : [ItemTypes.CONTAINER, ItemTypes.SPOOL];

  const ref = useRef<HTMLDivElement>(null);
  const [{ handlerId }, drop] = useDrop<DragItem, void, { handlerId: Identifier | null }>({
    accept: dropTypes,
    collect(monitor) {
      return {
        handlerId: monitor.getHandlerId(),
      };
    },
    hover(item, monitor) {
      if (!ref.current) {
        return null;
      }

      if ("spool" in item) {
        // Only allow dropping spools on the container if it's empty.
        if (spools.length > 0) {
          return null;
        }

        const spoolitem = item as SpoolDragItem;
        if (spoolitem.spool.location !== title) {
          moveSpoolLocation(spoolitem.spool.id, title);
          spoolitem.spool.location = title;
        }
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
    canDrag: !editTitle && title != EMPTYLOC,
    item: () => {
      return { title, index };
    },
    collect: (monitor: any) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const displayTitle = title == EMPTYLOC ? t("locations.no_location") : title;

  const opacity = isDragging ? 0 : 1;
  drag(drop(ref));

  const canEditTitle = title != EMPTYLOC;

  const titleStyle = {
    color: canEditTitle ? undefined : token.colorTextTertiary,
  };
  const spoolCountStyle = {
    color: token.colorTextQuaternary,
  };

  return (
    <div
      className={"loc-container " + (title != EMPTYLOC ? "grabable" : "")}
      ref={ref}
      style={{ opacity }}
      data-handler-id={handlerId}
    >
      <h3>
        {editTitle ? (
          <Input
            autoFocus
            variant="borderless"
            value={newTitle}
            onBlur={() => setEditTitle(false)}
            onChange={(e) => setNewTitle(e.target.value)}
            onPressEnter={() => {
              setEditTitle(false);
              return onEditTitle(newTitle);
            }}
          />
        ) : (
          <span
            className={canEditTitle ? "editable" : ""}
            onClick={() => {
              if (!canEditTitle) return;
              setNewTitle(title);
              setEditTitle(true);
            }}
            style={titleStyle}
          >
            {displayTitle}
            {<span style={spoolCountStyle}> ({spools.length})</span>}
          </span>
        )}
        {showDelete && <Button icon={<DeleteOutlined />} size="small" type="text" onClick={onDelete} />}
      </h3>
      <SpoolList spools={spools} spoolOrder={locationSpoolOrder} setSpoolOrder={setLocationSpoolOrder} />
    </div>
  );
}
