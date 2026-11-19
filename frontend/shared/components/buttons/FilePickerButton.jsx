import { useRef } from 'react';
import Button from './Button.jsx';

export default function FilePickerButton({label,children,onFiles,accept,multiple=false,disabled=false,...props}) {
  const input=useRef(null);
  return <><Button {...props} aria-label={label} disabled={disabled} onClick={()=>input.current.click()}>{children}</Button>
    <input ref={input} hidden aria-label={label} type="file" accept={accept} multiple={multiple} disabled={disabled} onChange={event=>{const files=Array.from(event.target.files);event.target.value='';onFiles(files);}} /></>;
}
