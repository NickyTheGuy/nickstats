import { svgProps } from './state/chart.mjs';

export default function SvgMark({ mark, active, tooltipId, onShow, onHide }) {
  const Shape = mark.type;
  const navigation = mark.navigation;
  const interactions = mark.tooltip
    ? {
        tabIndex: 0,
        'aria-describedby': active ? tooltipId : undefined,
        onPointerEnter: onShow,
        onPointerLeave: (event) => {
          if (event.pointerType !== 'touch') onHide();
        },
        onFocus: onShow,
        onBlur: onHide,
        onClick: onShow,
        onKeyDown: (event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onHide();
          } else if (!navigation && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            onShow();
          }
        },
      }
    : {};
  const shape = <Shape {...svgProps(mark.attributes)}>{mark.text}</Shape>;
  if (navigation) {
    return (
      <a
        {...interactions}
        href={navigation.href}
        className="graph-point-link"
        aria-label={`${navigation.label}${mark.tooltip ? ` · ${mark.tooltip.label}` : ''}`}
        onClick={(event) => {
          if (
            navigation.onActivate &&
            event.button === 0 &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.shiftKey &&
            !event.altKey
          ) {
            event.preventDefault();
            navigation.onActivate();
          }
        }}
      >
        {shape}
      </a>
    );
  }
  return (
    <Shape {...svgProps(mark.attributes)} {...interactions}>
      {mark.text}
    </Shape>
  );
}
