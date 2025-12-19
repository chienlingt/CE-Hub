import React from 'react';

export default function Modal({ show, onClose, children, maxWidth = 'max-w-lg' }) {
    if (!show) return null;

    return (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black bg-opacity-40">
            <div
                className={`bg-white rounded-lg shadow-lg p-6 w-full ${maxWidth} relative max-h-[90vh] overflow-y-auto`}
                tabIndex={-1}
            >
                <button
                    onClick={onClose}
                    className="absolute top-2 right-3 text-gray-400 hover:text-black text-lg"
                    aria-label="Close"
                >
                    &times;
                </button>
                {children}
            </div>
        </div>
    );
}
