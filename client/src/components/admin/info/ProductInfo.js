import React, { useState } from "react";
import InfoPage from "../../common/InfoPage";
import {
    getAllProducts,
    addProduct,
    updateProduct,
    deleteProduct,
    checkProductAssociations,
} from "../../../services/informationService";
import { StatusBadge } from "../../common/Badge";

const tableColumns = [
    { key: "ProductName", label: "Product Name" },
    { key: "EstimatedInstallationTimeMin", label: "Est. Time Min" },
    { key: "EstimatedInstallationTimeMax", label: "Est. Time Max" },
    { key: "FragileFlag", label: "Fragile", render: ({ FragileFlag }) => <StatusBadge isActive={FragileFlag} trueText="Yes" falseText="No" /> },
    { key: "AvailableFlag", label: "Available", render: ({ AvailableFlag }) => <StatusBadge isActive={AvailableFlag} trueText="Yes" falseText="No" /> },
];

const formFields = [
    { key: "ProductName", label: "Product Name", required: true, guidance: "E.g. Fridge, TV (standalone)" },
    { key: "FragileFlag", label: "Is this product fragile?", type: "select", options: [{value: true, label: "Yes"}, {value: false, label: "No"}] },
    { key: "NoLieDownFlag", label: "Can this product be laid down?", type: "select", options: [{value: true, label: "Yes"}, {value: false, label: "No"}] },
    { key: "DismantleRequiredFlag", label: "Does this product require dismantling?", type: "select", options: [{value: true, label: "Yes"}, {value: false, label: "No"}] },
    { key: "DismantleTime", label: "Dismantle Time (minutes)", type: "number", showWhen: (data) => data.DismantleRequiredFlag },
    { key: "NeedsInstallation", label: "Does this product need installation?", type: "select", options: [{value: true, label: "Yes"}, {value: false, label: "No"}] },
    { key: "EstimatedInstallationTimeMin", label: "Min Installation Time (minutes)", type: "number", guidance: "Minimum installation time in minutes", showWhen: (data) => data.NeedsInstallation },
    { key: "EstimatedInstallationTimeMax", label: "Max Installation Time (minutes)", type: "number", guidance: "Maximum installation time in minutes", showWhen: (data) => data.NeedsInstallation },
    { key: "InstallerTeamRequiredFlag", label: "Does this product require an installer team?", type: "select", options: [{value: true, label: "Yes"}, {value: false, label: "No"}], showWhen: (data) => data.NeedsInstallation },
    { key: "PackageLengthCM", label: "Package Length (cm)", type: "number" },
    { key: "PackageWidthCM", label: "Package Width (cm)", type: "number" },
    { key: "PackageHeightCM", label: "Package Height (cm)", type: "number" },
    { key: "AvailableFlag", label: "Is this product available?", type: "select", options: [{value: true, label: "Yes"}, {value: false, label: "No"}], defaultValue: true },
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
    NeedsInstallation: false,
    AvailableFlag: true,
};

function normalizeProduct(product) {
    const needsInstallation = !!(product.estimated_installation_time_min || product.estimated_installation_time_max || product.installer_team_required_flag);
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
        NeedsInstallation: needsInstallation,
        AvailableFlag: product.available_flag,
    };
}

function toApiFormat(product) {
    const toIntOrNull = (v) => v === "" ? null : Number(v);

    const needsInstallation = product.NeedsInstallation;

    return {
        product_name: product.ProductName,
        estimated_installation_time_min: needsInstallation ? toIntOrNull(product.EstimatedInstallationTimeMin) : null,
        estimated_installation_time_max: needsInstallation ? toIntOrNull(product.EstimatedInstallationTimeMax) : null,
        package_length_cm: toIntOrNull(product.PackageLengthCM),
        package_width_cm: toIntOrNull(product.PackageWidthCM),
        package_height_cm: toIntOrNull(product.PackageHeightCM),
        fragile_flag: product.FragileFlag,
        no_lie_down_flag: product.NoLieDownFlag,
        installer_team_required_flag: needsInstallation ? product.InstallerTeamRequiredFlag : false,
        dismantle_required_flag: product.DismantleRequiredFlag,
        dismantle_time: product.DismantleRequiredFlag ? toIntOrNull(product.DismantleTime) : null,
        available_flag: product.AvailableFlag,
    };
}

export default function ProductInfo() {
    async function handleDeleteProduct(id) {
        try {
            const { has_associations } = await checkProductAssociations(id);
            if (has_associations) {
                alert("This product cannot be deleted because it is associated with existing orders. Please remove it from all orders before deleting.");
            } else {
                if (window.confirm("Are you sure you want to delete this product?")) {
                    await deleteProduct(id);
                    window.location.reload(); // Or use a more sophisticated state management to refresh data
                }
            }
        } catch (error) {
            console.error("Failed to delete product or check for associations", error);
            alert("Failed to delete product. Please try again.");
        }
    }

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
            customDeleteHandler={handleDeleteProduct}
        />
    );
}
