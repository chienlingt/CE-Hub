import React from "react";
import InfoPage from "../../common/InfoPage";
import {
    getAllProducts,
    addProduct,
    updateProduct,
    deleteProduct,
} from "../../../services/informationService";
import { StatusBadge } from "../../common/Badge";

const tableColumns = [
    { key: "ProductName", label: "Product Name" },
    { key: "EstimatedInstallationTimeMin", label: "Est. Time Min" },
    { key: "EstimatedInstallationTimeMax", label: "Est. Time Max" },
    { key: "FragileFlag", label: "Fragile", render: ({ FragileFlag }) => <StatusBadge isActive={FragileFlag} /> },
];

const formFields = [
    { key: "ProductName", label: "Product Name", required: true, guidance: "E.g. Fridge, TV (standalone)" },
    { key: "EstimatedInstallationTimeMin", label: "Min Installation Time (minutes)", type: "number", guidance: "Minimum installation time in minutes" },
    { key: "EstimatedInstallationTimeMax", label: "Max Installation Time (minutes)", type: "number", guidance: "Maximum installation time in minutes" },
    { key: "PackageLengthCM", label: "Package Length (cm)", type: "number" },
    { key: "PackageWidthCM", label: "Package Width (cm)", type: "number" },
    { key: "PackageHeightCM", label: "Package Height (cm)", type: "number" },
    { key: "FragileFlag", label: "Fragile", type: "select", options: [{value: true, label: "Yes"}, {value: false, label: "No"}] },
    { key: "NoLieDownFlag", label: "Cannot Be Laid Down", type: "select", options: [{value: true, label: "Yes"}, {value: false, label: "No"}] },
    { key: "InstallerTeamRequiredFlag", label: "Requires Installer Team", type: "select", options: [{value: true, label: "Yes"}, {value: false, label: "No"}] },
    { key: "DismantleRequiredFlag", label: "Dismantle Required", type: "select", options: [{value: true, label: "Yes"}, {value: false, label: "No"}] },
    { key: "DismantleTime", label: "Dismantle Time (minutes)", type: "number" },
];

const initialState = {
    ProductName: "",
    EstimatedInstallationTimeMin: "",
    EstimatedInstallationTimeMax: "",
    PackageLengthCM: "",
    PackageWidthCM: "",
    PackageHeightCM: "",
    FragileFlag: false,
    NoLieDownFlag: false,
    InstallerTeamRequiredFlag: false,
    DismantleRequiredFlag: false,
    DismantleTime: "",
};

function normalizeProduct(product) {
    return {
        id: product.id,
        ProductName: product.product_name,
        EstimatedInstallationTimeMin: product.estimated_installation_time_min,
        EstimatedInstallationTimeMax: product.estimated_installation_time_max,
        PackageLengthCM: product.package_length_cm,
        PackageWidthCM: product.package_width_cm,
        PackageHeightCM: product.package_height_cm,
        FragileFlag: product.fragile_flag,
        NoLieDownFlag: product.no_lie_down_flag,
        InstallerTeamRequiredFlag: product.installer_team_required_flag,
        DismantleRequiredFlag: product.dismantle_required_flag,
        DismantleTime: product.dismantle_time,
    };
}

function toApiFormat(product) {
    const toIntOrNull = (v) => v === "" ? null : Number(v);

    return {
        product_name: product.ProductName,
        estimated_installation_time_min: toIntOrNull(product.EstimatedInstallationTimeMin),
        estimated_installation_time_max: toIntOrNull(product.EstimatedInstallationTimeMax),
        package_length_cm: toIntOrNull(product.PackageLengthCM),
        package_width_cm: toIntOrNull(product.PackageWidthCM),
        package_height_cm: toIntOrNull(product.PackageHeightCM),
        fragile_flag: product.FragileFlag,
        no_lie_down_flag: product.NoLieDownFlag,
        installer_team_required_flag: product.InstallerTeamRequiredFlag,
        dismantle_required_flag: product.DismantleRequiredFlag,
        dismantle_time: toIntOrNull(product.DismantleTime),
    };
}

export default function ProductInfo() {
    return (
        <InfoPage
            title="Product"
            getData={getAllProducts}
            addData={addProduct}
            updateData={updateProduct}
            deleteData={deleteProduct}
            tableColumns={tableColumns}
            formFields={formFields}
            initialState={initialState}
            normalizeData={normalizeProduct}
            toApiFormatData={toApiFormat}
        />
    );
}
