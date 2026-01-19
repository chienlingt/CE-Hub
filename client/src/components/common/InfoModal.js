import React from "react";
import Modal from "./Modal";

const InfoModal = ({
    show,
    onClose,
    mode,
    title,
    form,
    onFormSubmit,
    saving,
    children,
    error,
    formErrors = {}
}) => {
    return (
        <Modal show={show} onClose={onClose}>
            <h3 className="text-xl font-semibold mb-4">
                {mode === "add" ? `Add New ${title}` : `Edit ${title}`}
            </h3>
            {error && (
                <div className="mb-3 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
                    {error}
                </div>
            )}
            <form onSubmit={onFormSubmit} className="space-y-3">
                {children}
                <div className="flex gap-3 pt-2">
                    <button
                        type="submit"
                        className="flex-1 bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors duration-200 text-sm font-medium disabled:opacity-50"
                        disabled={saving || Object.keys(formErrors).length > 0}
                    >
                        {saving
                            ? mode === "add" ? "Adding..." : "Saving..."
                            : mode === "add" ? `Add ${title}` : "Save Changes"}
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-400 transition-colors duration-200 text-sm font-medium disabled:opacity-50"
                        disabled={saving}
                    >
                        Cancel
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default InfoModal;
