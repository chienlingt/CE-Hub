import React from 'react';

const FormField = ({
    fieldKey,
    label,
    value,
    onChange,
    type = 'text',
    options = [],
    required = false,
    guidance,
}) => {
    const renderField = () => {
        switch (type) {
            case 'select':
                return (
                    <select
                        name={fieldKey}
                        value={value ?? ''}
                        onChange={onChange}
                        className="border border-gray-300 p-2 rounded-md w-full text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        required={required}
                    >
                        <option value="">Select an option</option>
                        {options.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                );
            case 'boolean':
                return (
                    <input
                        type="checkbox"
                        name={fieldKey}
                        checked={!!value}
                        onChange={onChange}
                        className="h-5 w-5 text-green-600"
                    />
                );
            case 'textarea':
                return (
                    <textarea
                        name={fieldKey}
                        value={value ?? ''}
                        onChange={onChange}
                        className="border border-gray-300 p-2 rounded-md w-full text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        rows={2}
                        required={required}
                    />
                );
            default:
                return (
                    <input
                        name={fieldKey}
                        value={value ?? ''}
                        onChange={onChange}
                        className="border border-gray-300 p-2 rounded-md w-full text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        required={required}
                        type={type}
                    />
                );
        }
    };

    return (
        <div>
            <label className="block font-medium mb-1 text-sm">
                {label}
                {required && <span className="text-red-500 ml-1" title="Required field">★</span>}
            </label>
            {renderField()}
            {guidance && <div className="text-xs text-gray-400 mt-1">{guidance}</div>}
        </div>
    );
};

export default FormField;
