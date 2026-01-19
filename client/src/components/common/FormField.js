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
    error,
    placeholder,
    pattern,
    title
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
                        <option value="">{placeholder || 'Select...'}</option>
                        {options.map(option => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </select>
                );
            case 'textarea':
                return (
                    <textarea
                        name={fieldKey}
                        value={value ?? ''}
                        onChange={onChange}
                        className="border border-gray-300 p-2 rounded-md w-full text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        required={required}
                        placeholder={placeholder}
                    />
                );
            default:
                return (
                    <input
                        name={fieldKey}
                        type={type}
                        value={value ?? ''}
                        onChange={onChange}
                        className="border border-gray-300 p-2 rounded-md w-full text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        required={required}
                        placeholder={placeholder}
                        pattern={pattern}
                        title={title}
                    />
                );
        }
    };

    return (
        <div key={fieldKey}>
            <label className="block font-medium mb-1 text-sm">{label}</label>
            {renderField()}
            {guidance && <div className="text-xs text-gray-400 mt-1">{guidance}</div>}
            {error && <div className="text-xs text-red-500 mt-1">{error}</div>}
        </div>
    );
};

export default FormField;