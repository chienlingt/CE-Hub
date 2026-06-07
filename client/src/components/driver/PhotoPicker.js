// client/src/components/driver/PhotoPicker.js
// Gallery or camera photo selection for POD and issue evidence.
import { useRef } from 'react';
import { Image, Camera } from 'lucide-react';

/**
 * @param {{
 *   onFilesSelected: (files: File[]) => void,
 *   label?: string,
 *   variant?: 'default' | 'issue',
 *   photosRequired?: boolean,
 * }}
 */
export default function PhotoPicker({
  onFilesSelected,
  label = 'Add photos',
  variant = 'default',
  photosRequired = true,
}) {
  const galleryRef = useRef(null);
  const cameraRef  = useRef(null);

  const isIssue = variant === 'issue';

  function handleChange(e) {
    const files = Array.from(e.target.files || []);
    if (files.length) onFilesSelected(files);
    e.target.value = '';
  }

  const btnBase = 'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium border transition-colors';
  const btnDefault = `${btnBase} border-gray-200 text-gray-700 hover:bg-gray-50`;
  const btnIssue   = `${btnBase} border-red-200 text-red-700 hover:bg-red-50 bg-white`;

  return (
    <div>
      {label && (
        <p className="text-xs font-medium text-gray-700 mb-2">
          {label}
          {photosRequired && <span className="text-red-500"> *</span>}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => galleryRef.current?.click()}
          className={isIssue ? btnIssue : btnDefault}
        >
          <Image className="w-4 h-4" />
          Gallery
        </button>
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          className={isIssue ? btnIssue : btnDefault}
        >
          <Camera className="w-4 h-4" />
          Take photo
        </button>
      </div>
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleChange}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleChange}
      />
    </div>
  );
}
