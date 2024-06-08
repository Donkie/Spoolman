import Icon from "@ant-design/icons";
import SpoolSVG from "../icon_spool.svg?react";

export default function SpoolIcon(props: { color: string }) {
  return (
    <Icon
      component={SpoolSVG}
      style={{
        color: "#" + props.color,
        fontSize: 42,
        marginRight: 0,
      }}
    />
  );
}
