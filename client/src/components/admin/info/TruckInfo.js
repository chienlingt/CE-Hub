import React, { useState } from "react";
import InfoPage from "../../common/InfoPage";
import {
    getAllTrucks,
    addTruck,
    updateTruck,
    deleteTruck,
    checkTruckAssociations,
} from "../../../services/informationService";

// Dimensions are stored in cm (trucks.length_cm etc.) but shown and entered in feet.
const FT_TO_CM = 30.48;
const ftToCm = (ft) => Math.round(Number(ft) * FT_TO_CM);
const cmToFt = (cm) => (cm === null || cm === undefined || cm === "" ? "" : Math.round((cm / FT_TO_CM) * 10) / 10);

// "14 ft · 427 cm" — feet is what users think in, cm is what the scheduler stores.
// Uses the stored cm, not a re-conversion of the rounded feet, so the cm shown is exact.
function bothUnits(cm) {
    if (cm === "" || cm === null || cm === undefined) return "-";
    return `${cmToFt(cm)} ft · ${cm} cm`;
}

const cmGuidance = (key) => (form) =>
    form[key] === "" || form[key] === undefined || form[key] === null ? null : `= ${ftToCm(form[key])} cm`;

const tableColumns = [
    { key: "CarPlate", label: "Car Plate" },
    { key: "Tone", label: "Tonnage" },
    { key: "LengthFt", label: "Length", render: (t) => bothUnits(t.LengthCm) },
    { key: "WidthFt", label: "Width", render: (t) => bothUnits(t.WidthCm) },
    { key: "HeightFt", label: "Height", render: (t) => bothUnits(t.HeightCm) },
];

// Standard body dimensions per tonnage, so picking a tonnage pre-fills the size.
// Values stay editable for trucks that differ from the standard.
export const TONNAGE_PRESETS = {
    1: { LengthFt: 9, WidthFt: 5, HeightFt: 5 },
    3: { LengthFt: 14, WidthFt: 7, HeightFt: 7.2 },
};

const formFields = [
    {
        key: "CarPlate",
        label: "Car Plate",
        type: "text",
        required: true,
        placeholder: "e.g. ABC1234",
    },
    {
        key: "Tone",
        label: "Tonnage",
        type: "select",
        required: true,
        options: [
            { value: 1, label: "1 Ton" },
            { value: 3, label: "3 Ton" },
        ],
        guidance: "Fills in standard dimensions: 1 Ton = 9 × 5 × 5 ft (274 × 152 × 152 cm), 3 Ton = 14 × 7 × 7.2 ft (427 × 213 × 219 cm). You can still adjust them.",
        onValueChange: (value) => TONNAGE_PRESETS[Number(value)] || null,
    },
    {
        key: "LengthFt",
        label: "Length (ft)",
        type: "number",
        step: "0.1",
        required: true,
        placeholder: "e.g. 14",
        guidance: cmGuidance("LengthFt"),
    },
    {
        key: "WidthFt",
        label: "Width (ft)",
        type: "number",
        step: "0.1",
        required: true,
        placeholder: "e.g. 7",
        guidance: cmGuidance("WidthFt"),
    },
    {
        key: "HeightFt",
        label: "Height (ft)",
        type: "number",
        step: "0.1",
        required: true,
        placeholder: "e.g. 7.2",
        guidance: cmGuidance("HeightFt"),
    },
];

const initialState = {
    CarPlate: "",
    Tone: "",
    LengthFt: "",
    WidthFt: "",
    HeightFt: "",
};

function normalizeTruck(truck) {
    return {
        id: truck.id,
        CarPlate: truck.plate_no,
        Tone: truck.tone,
        LengthFt: cmToFt(truck.length_cm),
        WidthFt: cmToFt(truck.width_cm),
        HeightFt: cmToFt(truck.height_cm),
        // Raw stored values, for the table only; saving always converts from the ft fields.
        LengthCm: truck.length_cm,
        WidthCm: truck.width_cm,
        HeightCm: truck.height_cm,
    };
}

function toApiFormat(truck) {
    return {
        plate_no: truck.CarPlate,
        tone: Number(truck.Tone),
        length_cm: ftToCm(truck.LengthFt),
        width_cm: ftToCm(truck.WidthFt),
        height_cm: ftToCm(truck.HeightFt),
    };
}

export default function TruckInfo() {
    async function handleDeleteTruck(id) {
        try {
            const { has_associations } = await checkTruckAssociations(id);
            if (has_associations) {
                alert("This truck cannot be deleted because it is associated with existing lorry trips, truck zones, or time slots. Please remove the associations before deleting.");
            } else {
                if (window.confirm("Are you sure you want to delete this truck?")) {
                    await deleteTruck(id);
                    window.location.reload();
                }
            }
        } catch (error) {
            console.error("Failed to delete truck or check for associations", error);
            alert("Failed to delete truck. Please try again.");
        }
    }

    return (
        <InfoPage
            title="Truck"
            getData={getAllTrucks}
            addData={addTruck}
            updateData={updateTruck}
            deleteData={deleteTruck}
            tableColumns={tableColumns}
            formFields={formFields}
            initialState={initialState}
            normalizeData={normalizeTruck}
            toApiFormatData={toApiFormat}
            customDeleteHandler={handleDeleteTruck}
        />
    );
}
