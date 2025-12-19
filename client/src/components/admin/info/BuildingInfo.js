import React, { useState, useEffect } from "react";
import InfoPage from "../../common/InfoPage";
import {
    getAllBuildings,
    addBuilding,
    updateBuilding,
    deleteBuilding,
    getAllZones
} from "../../../services/informationService";
import { StatusBadge } from "../../common/Badge";

export default function BuildingInfo() {
    const [formFields, setFormFields] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadZones() {
            try {
                const zones = await getAllZones();
                const zoneOptions = zones.map(z => ({ value: z.id, label: z.zone_name || z.name || z.id }));

                setFormFields([
                    { key: "building_name", label: "Building Name", required: true, guidance: "E.g. KL Trillion" },
                    { key: "zone_id", label: "Zone", type: "select", options: zoneOptions, required: true, guidance: "Select the zone this building belongs to" },
                    { key: "housing_type", label: "Housing Type", required: true, guidance: "E.g. Condominium, Apartment, etc." },
                    { key: "postal_code", label: "Postal Code", required: true, guidance: "E.g. 51481" },
                    { key: "address", label: "Address", guidance: "Full address of the building" },
                    { key: "access_time_window_start", label: "Access Start", type: "time", guidance: "E.g. 09:00" },
                    { key: "access_time_window_end", label: "Access End", type: "time", guidance: "E.g. 17:00" },
                    { key: "lift_available", label: "Lift Available", type: "select", options: [{ value: true, label: "Yes" }, { value: false, label: "No" }] },
                    { key: "lift_dimensions", label: "Lift Dimensions", guidance: "E.g. 200cm x 150cm x 220cm" },
                    { key: "loading_bay_available", label: "Loading Bay Available", type: "select", options: [{ value: true, label: "Yes" }, { value: false, label: "No" }] },
                    { key: "vehicle_size_limit", label: "Vehicle Size Limit", guidance: "E.g. 3T, 1T" },
                    { key: "vehicle_length_limit", label: "Vehicle Length Limit", guidance: "E.g. 5m" },
                    { key: "vehicle_width_limit", label: "Vehicle Width Limit", guidance: "E.g. 2.5m" },
                    { key: "pre_registration_required", label: "Pre-Registration", type: "select", options: [{ value: true, label: "Yes" }, { value: false, label: "No" }] },
                    { key: "special_equipment_needed", label: "Special Equipment", guidance: "Comma-separated list if any. E.g. Trolley, Ladder" },
                    { key: "parking_distance", label: "Parking Distance", guidance: "E.g. 50m from loading bay" },
                    { key: "narrow_doorways", label: "Narrow Doorways", type: "select", options: [{ value: true, label: "Yes" }, { value: false, label: "No" }] },
                    { key: "notes", label: "Notes", type: "textarea" },
                ]);
            } catch (error) {
                console.error("Failed to load zones for form", error);
            }
            setLoading(false);
        }
        loadZones();
    }, []);


    const tableColumns = [
        { key: "building_name", label: "Building Name" },
        { key: "housing_type", label: "Housing Type" },
        { key: "postal_code", label: "Postal Code" },
        { key: "lift_available", label: "Lift", render: ({ lift_available }) => <StatusBadge isActive={lift_available} trueText="Yes" falseText="No" /> },
        { key: "loading_bay_available", label: "Loading Bay", render: ({ loading_bay_available }) => <StatusBadge isActive={loading_bay_available} trueText="Yes" falseText="No" /> },
    ];

    const initialState = {
        building_name: "",
        zone_id: "",
        housing_type: "",
        postal_code: "",
        address: "",
        access_time_window_start: "",
        access_time_window_end: "",
        lift_available: false,
        lift_dimensions: "",
        loading_bay_available: false,
        vehicle_size_limit: "",
        vehicle_length_limit: "",
        vehicle_width_limit: "",
        pre_registration_required: false,
        special_equipment_needed: "",
        parking_distance: "",
        narrow_doorways: false,
        notes: ""
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                <span className="ml-2 text-gray-500">Loading building configuration...</span>
            </div>
        )
    }

    return (
        <InfoPage
            title="Building"
            getData={getAllBuildings}
            addData={addBuilding}
            updateData={updateBuilding}
            deleteData={deleteBuilding}
            tableColumns={tableColumns}
            formFields={formFields}
            initialState={initialState}
        />
    );
}
