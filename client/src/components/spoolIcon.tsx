import "./spoolIcon.css";

export default function SpoolIcon(props: { color: string | string[] }) {
  const cols = Array.isArray(props.color) ? props.color : [props.color];

  return (
    <div className="spool-icon">
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
