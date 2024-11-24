import { theme } from "antd";
import { ISpool } from "../../spools/model";
import { SpoolCard } from "./spoolCard";

const { useToken } = theme;

export function SpoolList({
  spools,
  spoolOrder,
  setSpoolOrder,
}: {
  spools: ISpool[];
  spoolOrder: number[];
  setSpoolOrder: (spoolOrder: number[]) => void;
}) {
  const { token } = useToken();

  // Make sure all spools are in the spoolOrders array
  const finalSpoolOrder = [...spoolOrder].filter((id) => spools.find((spool) => spool.id === id)); // Remove any spools that are not in the spools array
  spools.forEach((spool) => {
    if (!finalSpoolOrder.includes(spool.id)) finalSpoolOrder.push(spool.id);
  });

  const moveSpoolOrder = (spool_id: number, hoverIndex: number) => {
    // Move spool spool_id to position hoverIndex
    let curIdx = finalSpoolOrder.indexOf(spool_id);
    if (curIdx === -1) {
      // Spool is missing from spool order array, add it to the end of the array
      finalSpoolOrder.push(spool_id);
      curIdx = finalSpoolOrder.length - 1;
    } else if (curIdx === hoverIndex) {
      // Spool is already in the right position
      return;
    }

    const newSpoolOrder = [...finalSpoolOrder];
    newSpoolOrder.splice(curIdx, 1);
    newSpoolOrder.splice(hoverIndex, 0, finalSpoolOrder[curIdx]);
    setSpoolOrder(newSpoolOrder);
  };

  const style = {
    backgroundColor: token.colorBgContainer,
    borderRadius: token.borderRadiusLG,
  };

  return (
    <div className="loc-spools" style={style}>
      {spools.map((spool, idx) => (
        <SpoolCard key={spool.id} index={idx} spool={spool} moveSpoolOrder={moveSpoolOrder} />
      ))}
    </div>
  );
}
