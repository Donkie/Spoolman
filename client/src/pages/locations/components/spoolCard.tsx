import { useNavigation, useTranslate } from "@refinedev/core";
import { Button, theme } from "antd";
import { useDrag } from "react-dnd";

import { EditOutlined, EyeOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import SpoolIcon from "../../../components/spoolIcon";
import { ISpool } from "../../spools/model";
import { ItemTypes } from "../itemTypes";

const { useToken } = theme;

export function SpoolCard({ spool }: { spool: ISpool }) {
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
