import { PlusOutlined } from "@ant-design/icons";
import { useInvalidate, useList, useTranslate } from "@refinedev/core";
import { Button } from "antd";
import { useEffect, useMemo } from "react";
import { useSetSetting } from "../../../utils/querySettings";
import { ISpool } from "../../spools/model";
import { renameSpoolLocation, useLocations } from "../functions";
import { Location } from "./location";

export function LocationContainer() {
  const t = useTranslate();
  const invalidate = useInvalidate();

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
    setLocationsSetting.mutate(newLocs);
  };

  const onEditTitle = async (location: string, newTitle: string) => {
    if (newTitle == location) return;
    if (newTitle == "") return;
    if (locationsList.includes(newTitle)) return;

    // Update all spool locations in the database
    if (spoolLocations[location] && spoolLocations[location].length > 0) {
      await renameSpoolLocation(location, newTitle);
      await invalidate({ resource: "spool", invalidates: ["list", "detail"] });
    }

    // Update the value in the settings
    const newLocs = [...locationsList];
    newLocs[locationsList.indexOf(location)] = newTitle;
    setLocationsSetting.mutate(newLocs);
  };

  // Create containers
  const containers = locationsList.map((loc, idx) => {
    const spools = spoolLocations[loc] ?? [];
    return (
      <Location
        key={loc}
        index={idx}
        title={loc}
        spools={spools}
        showDelete={spools.length == 0}
        onDelete={() => {
          setLocationsSetting.mutate(locationsList.filter((l) => l !== loc));
        }}
        moveLocation={moveLocation}
        onEditTitle={(newTitle: string) => onEditTitle(loc, newTitle)}
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

  const addNewLocation = () => {
    let newLocationName = "New Location";

    const newLocs = [...locationsList];
    let i = 1;
    while (newLocs.includes(newLocationName)) {
      newLocationName = "New Location " + i;
      i++;
    }
    newLocs.push(newLocationName);

    setLocationsSetting.mutate(newLocs);
  };

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
          onClick={addNewLocation}
        />
      </div>
    </div>
  );
}
