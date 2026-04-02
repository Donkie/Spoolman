import { PlusOutlined } from "@ant-design/icons";
import { useList, useTranslate } from "@refinedev/core";
import { Button } from "antd";
import { useEffect, useMemo } from "react";
import { useSetSetting } from "../../../utils/querySettings";
import { ISpool } from "../../spools/model";
import { EMPTYLOC, useLocations, useLocationsSpoolOrders, useRenameSpoolLocation } from "../functions";
import { Location } from "./location";

export function LocationContainer() {
  const t = useTranslate();
  const renameSpoolLocation = useRenameSpoolLocation();

  const settingsLocations = useLocations();
  const setLocationsSetting = useSetSetting<string[]>("locations");

  const locationsSpoolOrders = useLocationsSpoolOrders();
  const setLocationsSpoolOrders = useSetSetting<Record<string, number[]>>("locations_spoolorders");

  const { result: spoolData, query } = useList<ISpool>({
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
  const isLoading = query.isLoading;
  const isError = query.isError;

  // Group spools by location
  const spoolLocations = (() => {
    const spools = spoolData?.data ?? [];
    spools.sort((a, b) => a.id - b.id);

    const grouped: Record<string, ISpool[]> = {};
    spools.forEach((spool) => {
      const loc = spool.location ?? EMPTYLOC;
      if (!grouped[loc]) {
        grouped[loc] = [];
      }
      grouped[loc].push(spool);
    });

    // Sort spools in the locations by the spool order
    for (const loc of Object.keys(grouped)) {
      if (!locationsSpoolOrders[loc]) {
        continue;
      }
      grouped[loc].sort((a, b) => {
        let aidx = locationsSpoolOrders[loc].indexOf(a.id);
        if (aidx === -1) {
          aidx = 999999;
        }
        let bidx = locationsSpoolOrders[loc].indexOf(b.id);
        if (bidx === -1) {
          bidx = 999999;
        }
        return aidx - bidx;
      });
    }

    return grouped;
  })();

  // Create list of locations that's sorted
  const locationsList = useMemo(() => {
    // Start with the default loc
    const allLocs = [];
    if (EMPTYLOC in spoolLocations) {
      allLocs.push(EMPTYLOC);
    }

    // Add from the locations setting
    if (settingsLocations) allLocs.push(...settingsLocations);

    // Add any missing locations from the spools
    for (const loc of Object.keys(spoolLocations)) {
      if (loc != EMPTYLOC && !allLocs.includes(loc)) {
        allLocs.push(loc);
      }
    }

    return allLocs;
  }, [spoolLocations, settingsLocations]);

  const moveLocation = (dragIndex: number, hoverIndex: number) => {
    const newLocs = [...locationsList];
    newLocs.splice(dragIndex, 1);
    newLocs.splice(hoverIndex, 0, locationsList[dragIndex]);
    setLocationsSetting.mutate(newLocs.filter((loc) => loc != EMPTYLOC));
  };

  const onEditTitle = async (location: string, newTitle: string) => {
    if (location == "") return; // Can't edit the default location
    if (newTitle == location) return; // No change
    if (newTitle == "") return; // Can't have an empty location
    if (locationsList.includes(newTitle)) return; // Location already exists

    // Update all spool locations in the database
    if (spoolLocations[location] && spoolLocations[location].length > 0) {
      renameSpoolLocation.mutate({ old: location, new: newTitle });
    }

    // Update the value in the settings
    const newLocs = [...locationsList].filter((loc) => loc != EMPTYLOC);
    newLocs[newLocs.indexOf(location)] = newTitle;
    setLocationsSetting.mutate(newLocs);
  };

  const setLocationSpoolOrder = (location: string, spoolOrder: number[]) => {
    setLocationsSpoolOrders.mutate({
      ...locationsSpoolOrders,
      [location]: spoolOrder,
    });
  };

  // Create containers
  const containers = locationsList.map((loc, idx) => {
    const spools = spoolLocations[loc] ?? [];
    const spoolOrder = locationsSpoolOrders[loc] ?? [];

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
        locationSpoolOrder={spoolOrder}
        setLocationSpoolOrder={(spoolOrder: number[]) => setLocationSpoolOrder(loc, spoolOrder)}
      />
    );
  });

  // Update locations settings so it always includes all spool locations
  useEffect(() => {
    // Check if they're not the same
    const curLocList = locationsList.filter((l) => l != EMPTYLOC);
    if (settingsLocations != null && JSON.stringify(curLocList) !== JSON.stringify(settingsLocations)) {
      setLocationsSetting.mutate(curLocList);
    }
  }, [locationsList, settingsLocations, setLocationsSetting]);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (isError) {
    return <div>Failed to load spools</div>;
  }

  const addNewLocation = () => {
    const baseLocationName = t("locations.new_location");
    let newLocationName = baseLocationName;

    const newLocs = [...locationsList];
    let i = 1;
    while (newLocs.includes(newLocationName)) {
      newLocationName = baseLocationName + " " + i;
      i++;
    }
    newLocs.push(newLocationName);

    setLocationsSetting.mutate(newLocs);
  };

  return (
    <div>
      {!isLoading && spoolData.data.length == 0 && (
        <div className="no-locations">{t("locations.no_locations_help")}</div>
      )}
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
    </div>
  );
}
