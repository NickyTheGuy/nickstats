import { useState } from 'react';

export default function FileDropZone({ id, inputId, labelId, label, accept, disabled, resetKey, onFiles, children }) {
  const [dragging, setDragging] = useState(false);
  function hover(event) { event.preventDefault(); if (!disabled) setDragging(true); }
  return <div id={id} className={`demo-drop${dragging && !disabled ? ' dragging' : ''}${disabled ? ' disabled' : ''}`}
    onDragEnter={hover} onDragOver={hover} onDragLeave={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false);
    }} onDrop={event => { event.preventDefault(); setDragging(false); if (!disabled) onFiles(event.dataTransfer.files); }}>
    <div><strong id={labelId}>{label}</strong><span>{children}</span></div>
    <label className="button button-primary" htmlFor={inputId}>Choose demos</label>
    <input key={resetKey} className="file-input" id={inputId} type="file" multiple accept={accept} disabled={disabled}
      onChange={event => onFiles(event.target.files)} />
  </div>;
}
