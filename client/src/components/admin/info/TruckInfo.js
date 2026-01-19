import React, { useState } from "react";
import InfoPage from "../../common/InfoPage";
import {
    getAllTrucks,
    addTruck,
    updateTruck,
    deleteTruck,
    checkTruckAssociations,
} from "../../../services/informationService";

const tableColumns = [
    { key: "CarPlate", label: "Car Plate" },
    { key: "Tone", label: "Tonnage" },
    { key: "LengthCM", label: "Length (cm)" },
    { key: "WidthCM", label: "Width (cm)" },
    { key: "HeightCM", label: "Height (cm)" },
];

const formFields = [
    {
        key: "CarPlate",
        label: "Car Plate",
        type: "text",
        required: true,
        placeholder: "e.g. ABC1234",
        guidance: "E.g. ABC1234 (3 uppercase letters followed by 4 numbers)",
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
    },
    {
        key: "LengthCM",
        label: "Length (cm)",
        type: "number",
        required: true,
        placeholder: "e.g. 260",
    },
    {
        key: "WidthCM",
        label: "Width (cm)",
        type: "number",
        required: true,
        placeholder: "e.g. 170",
    },
    {
        key: "HeightCM",
        label: "Height (cm)",
        type: "number",
        required: true,
        placeholder: "e.g. 180",
    },
];

const initialState = {
    CarPlate: "",
    Tone: "",
    LengthCM: "",
    WidthCM: "",
    HeightCM: "",
};

function normalizeTruck(truck) {
    return {
        id: truck.id,
        CarPlate: truck.plate_no,
        Tone: truck.tone,
        LengthCM: truck.length_cm,
        WidthCM: truck.width_cm,
        HeightCM: truck.height_cm
    };
}

function toApiFormat(truck) {
    return {
        plate_no: truck.CarPlate,
        tone: Number(truck.Tone),
        length_cm: Number(truck.LengthCM),
        width_cm: Number(truck.WidthCM),
        height_cm: Number(truck.HeightCM)
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
