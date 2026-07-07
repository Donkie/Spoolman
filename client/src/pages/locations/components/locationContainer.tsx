import { useList, useTranslate } from "@refinedev/core";
import { Input, Modal, Spin } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useSetSetting } from "../../../utils/querySettings";
import { ISpool } from "../../spools/model";
import { EMPTYLOC, useLocations, useLocationsSpoolOrders, useRenameSpoolLocation } from "../functions";
import { Location } from "./location";

interface LocationContainerProps {
  modalOpen: boolean;
  setModalOpen: (open: boolean) => void;
}

export function LocationContainer({ modalOpen, setModalOpen }: LocationContainerProps) {
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

  const [newLocationName, setNewLocationName] = useState("");
  const [modalError, setModalError] = useState("");

  if (isLoading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (isError) {
    return <div>Failed to load spools</div>;
  }

  const addNewLocation = () => {
    const name = newLocationName.trim();
    if (!name) {
      setModalError(t("locations.error_empty") || "Name cannot be empty");
      return;
    }
    if (locationsList.includes(name)) {
      setModalError(t("locations.error_exists") || "Location already exists");
      return;
    }

    const newLocs = [...locationsList];
    newLocs.push(name);
    setLocationsSetting.mutate(newLocs);
    setModalOpen(false);
    setNewLocationName("");
    setModalError("");
  };

  return (
    <div>
      <Modal
        title={t("locations.new_location")}
        open={modalOpen}
        onOk={addNewLocation}
        onCancel={() => {
          setModalOpen(false);
          setNewLocationName("");
          setModalError("");
        }}
        okText={t("buttons.create") || "Create"}
        okButtonProps={{ disabled: !newLocationName.trim() }}
      >
        <Input
          autoFocus
          placeholder=""
          value={newLocationName}
          onChange={(e) => {
            setNewLocationName(e.target.value);
            setModalError("");
          }}
          onPressEnter={addNewLocation}
          status={modalError ? "error" : undefined}
          style={{ marginTop: 8 }}
        />
        {modalError && <div style={{ color: "#ff4d4f", fontSize: 12, marginTop: 4 }}>{modalError}</div>}
      </Modal>
      {!isLoading && (spoolData?.data?.length ?? 0) === 0 && (
        <div className="loc-empty-state" style={{ padding: 48 }}>
          {t("locations.no_locations_help")}
        </div>
      )}
      <div className="loc-metacontainer">{containers}</div>
    </div>
  );
}
