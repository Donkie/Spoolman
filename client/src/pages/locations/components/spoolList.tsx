import { useInvalidate } from "@refinedev/core";
import { useDrop } from "react-dnd";

import { theme } from "antd";
import { ISpool } from "../../spools/model";
import { ItemTypes } from "../itemTypes";
import { setSpoolLocation } from "./../functions";
import { SpoolCard } from "./spoolCard";

const { useToken } = theme;

export function SpoolList({
  location,
  spools,
  spoolOrder,
  setSpoolOrder,
}: {
  location: string;
  spools: ISpool[];
  spoolOrder: number[];
  setSpoolOrder: (spoolOrder: number[]) => void;
}) {
  const { token } = useToken();
  const invalidate = useInvalidate();
  const [, spoolDrop] = useDrop(() => ({
    accept: ItemTypes.SPOOL,
    drop: async (item: ISpool) => {
      if (item.location === location) return;
      await setSpoolLocation(item.id, location);
      await invalidate({
        resource: "spool",
        id: item.id,
        invalidates: ["list", "detail"],
      });
    },
  }));

  // Make sure all spools are in the spoolOrders array
  const finalSpoolOrder = [...spoolOrder].filter((id) => spools.find((spool) => spool.id === id)); // Remove any spools that are not in the spools array
  spools.forEach((spool) => {
    if (!finalSpoolOrder.includes(spool.id)) finalSpoolOrder.push(spool.id);
  });

  // Reorder the spools based on the spoolOrder array
  const reorderedSpools = finalSpoolOrder.map((id) => spools.find((spool) => spool.id === id)!);

  const style = {
    backgroundColor: token.colorBgContainer,
    borderRadius: token.borderRadiusLG,
  };

  return (
    <div className="loc-spools" ref={spoolDrop} style={style}>
      {reorderedSpools.map((spool) => (
        <SpoolCard key={spool.id} spool={spool} />
      ))}
    </div>
  );
}
