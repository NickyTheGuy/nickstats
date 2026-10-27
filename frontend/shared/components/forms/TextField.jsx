export default function TextField({ id, label, action, ...inputProps }) {
  const input = <input id={id} {...inputProps} />;
  return <><label htmlFor={id}>{label}</label>{action ? <div>{input}{action}</div> : input}</>;
}
