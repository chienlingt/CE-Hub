// Evidence photos a driver uploads with a failure or report (issue_evidence).
// stopPropagation is always applied so thumbnails inside clickable table rows
// open the photo without also opening the row's modal.
import React from 'react';
import { Image } from 'lucide-react';
import { API_BASE_URL as API_BASE } from '../../../../utils/apiBaseUrl';

function mediaUrl(path) {
  if (path.startsWith('http') || path.startsWith('data:')) return path;
  return `${API_BASE.replace(/\/$/, '')}${path}`;
}

export default function EvidenceThumbnails({ evidence = [], emptyFallback = null, showCount = false }) {
  if (!evidence.length) return emptyFallback;
  return (
    <div>
      {showCount && (
        <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1.5">
          <Image size={12} className="text-gray-400" />
          {evidence.length} photo{evidence.length !== 1 ? 's' : ''}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {evidence.map((url, i) => (
          <a
            key={i}
            href={mediaUrl(url)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
          >
            <img
              src={mediaUrl(url)}
              alt={`evidence-${i}`}
              className="w-16 h-16 object-cover rounded-lg border border-gray-200 hover:border-blue-400 transition-colors"
            />
          </a>
        ))}
      </div>
    </div>
  );
}
