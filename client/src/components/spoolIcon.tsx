import "./spoolIcon.css";

interface Props {
  color: string | { colors: string[]; vertical: boolean };
  size?: "small" | "large";
}

export default function SpoolIcon(props: Props) {
  let dirClass = "vertical";
  let cols = [];
  let size = props.size ? props.size : "small";

  if (typeof props.color === "string") {
    cols = [props.color];
  } else {
    dirClass = props.color.vertical ? "vertical" : "horizontal";
    cols = props.color.colors;
  }

  return (
    <div className={"spool-icon " + dirClass + " " + size}>
      {cols.map((col) => (
        <div
          key={col}
          style={{
            backgroundColor: "#" + col.replace("#", ""),
          }}
        ></div>
      ))}
    </div>
  );
}
