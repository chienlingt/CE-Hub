// import React from 'react';
// import { StatusBadge } from './Badge';

// const InfoTable = ({
//     headers,
//     data,
//     loading,
//     onEdit,
//     onDelete,
//     saving,
//     renderCell,
// }) => {
//     return (
//         <div className="overflow-x-auto">
//             <table className="min-w-full divide-y divide-gray-200">
//                 <thead className="bg-gray-50">
//                     <tr>
//                         <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">#</th>
//                         {Object.entries(headers).map(([key, value]) => (
//                             <th key={key} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
//                                 {value}
//                             </th>
//                         ))}
//                         <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
//                     </tr>
//                 </thead>
//                 <tbody className="bg-white divide-y divide-gray-200">
//                     {loading ? (
//                         <tr>
//                             <td colSpan={Object.keys(headers).length + 2} className="text-center py-8">
//                                 <div className="flex items-center justify-center">
//                                     <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
//                                     <span className="ml-2 text-gray-500">Loading...</span>
//                                 </div>
//                             </td>
//                         </tr>
//                     ) : data.length === 0 ? (
//                         <tr>
//                             <td colSpan={Object.keys(headers).length + 2} className="text-center py-8 text-gray-500">
//                                 No data found.
//                             </td>
//                         </tr>
//                     ) : (
//                         data.map((item, idx) => (
//                             <tr key={item.id} className="hover:bg-gray-50">
//                                 <td className="px-4 py-3 text-sm font-medium text-gray-900">{idx + 1}</td>
//                                 {Object.keys(headers).map(key => (
//                                     <td className="px-4 py-3 text-sm text-gray-900" key={key}>
//                                         {renderCell ? renderCell(key, item[key]) : (item[key]?.toString() ?? '-')}
//                                     </td>
//                                 ))}
//                                 <td className="px-4 py-3 text-sm">
//                                     <div className="flex gap-2">
//                                         <button
//                                             onClick={() => onEdit(idx)}
//                                             className="px-3 py-1 rounded-md text-blue-600 hover:bg-blue-50 transition-colors duration-200"
//                                             title="Edit"
//                                             disabled={saving}
//                                         >
//                                             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//                                                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
//                                             </svg>
//                                         </button>
//                                         <button
//                                             onClick={() => onDelete(item.id)}
//                                             className="px-3 py-1 rounded-md text-red-600 hover:bg-red-50 transition-colors duration-200"
//                                             title="Delete"
//                                             disabled={saving}
//                                         >
//                                             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//                                                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
//                                             </svg>
//                                         </button>
//                                     </div>
//                                 </td>
//                             </tr>
//                         ))
//                     )}
//                 </tbody>
//             </table>
//         </div>
//     );
// };

// export default InfoTable;
