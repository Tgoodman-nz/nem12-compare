import { useRef, useState } from 'react';
import type { Nem12Data } from '../types';
import { parseNem12, formatNem12Date, Nem12ParseError } from '../utils/nem12Parser';

interface Props {
  onParsed: (data: Nem12Data) => void;
}

export function FileUpload({ onParsed }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [parsed, setParsed] = useState<Nem12Data | null>(null);

  function handleFile(file: File) {
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const data = parseNem12(content);
        setParsed(data);
        onParsed(data);
      } catch (err) {
        if (err instanceof Nem12ParseError) {
          setError(err.message);
        } else {
          setError('Unexpected error reading file.');
        }
      }
    };
    reader.readAsText(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  return (
    <div className="card">
      <h2>Step 1 — Upload NEM12 file</h2>
      <p className="hint">
        Your NEM12 file comes from your electricity retailer. It stays on your device — nothing is uploaded.
      </p>

      <div
        className={`dropzone${dragging ? ' dragging' : ''}${parsed ? ' success' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.txt"
          style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        {parsed ? (
          <div className="parsed-summary">
            <span className="check">✓</span>
            <div>
              <strong>NMI {parsed.nmi}</strong>
              <div>{formatNem12Date(parsed.dateFrom)} → {formatNem12Date(parsed.dateTo)}</div>
              <div>{parsed.intervals.length} days · {parsed.totalKwh.toFixed(1)} kWh total</div>
            </div>
          </div>
        ) : (
          <div className="dropzone-prompt">
            <svg width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <p>Drop your NEM12 file here or <span className="link">browse</span></p>
            <p className="hint">Accepts .csv or .txt</p>
          </div>
        )}
      </div>

      {error && <p className="error">{error}</p>}
    </div>
  );
}
