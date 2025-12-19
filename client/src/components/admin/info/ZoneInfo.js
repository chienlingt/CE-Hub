import React from "react";
import InfoPage from "../../common/InfoPage";
import {
    getAllZones,
    addZone,
    updateZone,
    deleteZone,
} from "../../../services/informationService";

const tableColumns = [
    { key: "ZoneName", label: "Zone Name" },
];

const formFields = [
    {
        key: "ZoneName",
        label: "Zone Name",
        required: true,
        guidance: "E.g. KLCC, Damansara, etc.",
    },
];

const initialState = {
    ZoneName: "",
};

function normalizeZone(zone) {
    return {
        id: zone.id,
        ZoneName: zone.zone_name,
    };
}

function toApiFormat(zone) {
    return {
        zone_name: zone.ZoneName,
    };
}

export default function ZoneInfo() {
    return (
        <InfoPage
            title="Zone"
            getData={getAllZones}
            addData={addZone}
            updateData={updateZone}
            deleteData={deleteZone}
            tableColumns={tableColumns}
            formFields={formFields}
            initialState={initialState}
            normalizeData={normalizeZone}
            toApiFormatData={toApiFormat}
        />
    );
}
