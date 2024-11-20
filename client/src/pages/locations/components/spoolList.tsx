import { useInvalidate } from "@refinedev/core";
import { useDrop } from "react-dnd";

import { theme } from "antd";
import { ISpool } from "../../spools/model";
import { ItemTypes } from "../itemTypes";
import { setSpoolLocation } from "./../functions";
import { SpoolCard } from "./spoolCard";

const { useToken } = theme;

export function SpoolList({ location, spools }: { location: string; spools: ISpool[] }) {
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
