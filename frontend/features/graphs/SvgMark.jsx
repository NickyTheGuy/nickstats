import { svgProps } from './state/chart.mjs';

export default function SvgMark({ mark, active, tooltipId, onShow, onHide }) {
  const Shape = mark.type;
  const interactions = mark.tooltip ? {
    tabIndex: 0, 'aria-describedby': active ? tooltipId : undefined,
    onPointerEnter: onShow, onPointerLeave: event => { if (event.pointerType !== 'touch') onHide(); },
    onFocus: onShow, onBlur: onHide, onClick: onShow,
    onKeyDown: event => {
      if (event.key === 'Escape') { event.preventDefault(); onHide(); }
      else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onShow(); }
    }
  } : {};
  return <Shape {...svgProps(mark.attributes)} {...interactions}>{mark.text}</Shape>;
}
