import { useRef, useState } from 'react';
import { groupSelection } from '../state/editing.mjs';

const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
export default function useRuleGestures({ rules, onRules, onMove }) {
  const board = useRef(null), pending = useRef(null);
  const [gesture, setGesture] = useState(null), [selected, setSelected] = useState([]), [notice, setNotice] = useState('');
  function select(id, additive = false) {
    setSelected(previous => additive ? previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id] : [id]);
  }
  function begin(event, move = null) {
    if (event.button !== 0 || event.isPrimary === false) return;
    if (!move && event.target.closest('button,summary,input,select,a,[data-no-gesture]')) return;
    const cell = event.target.closest('[data-movable-id]');
    const moving = move || (cell ? { id: cell.dataset.movableId, playerId: cell.dataset.benchPlayer || null } : null);
    const team = event.target.closest('[data-team-root]');
    if (!moving && (!team || event.pointerType === 'touch')) return;
    event.preventDefault(); event.stopPropagation();
    board.current.setPointerCapture(event.pointerId);
    pending.current = { kind: moving ? 'move' : 'marquee', moving, team, x: event.clientX, y: event.clientY,
      pointerId: event.pointerId, moved: false, additive: event.shiftKey || event.metaKey || event.ctrlKey || event.pointerType === 'touch' };
    setNotice('');
  }
  function motion(event) {
    const current = pending.current;
    if (!current || event.pointerId !== current.pointerId) return;
    if (!current.moved && Math.hypot(event.clientX - current.x, event.clientY - current.y) < 6) return;
    current.moved = true;
    if (current.kind === 'move') {
      const destination = document.elementsFromPoint(event.clientX, event.clientY)
        .map(element => element.closest('[data-drop-group]')).find(Boolean);
      current.target = destination?.dataset.dropGroup || null;
      setGesture({ kind: 'move', x: event.clientX, y: event.clientY, target: current.target, moving: current.moving });
    } else {
      const bounds = current.team.getBoundingClientRect();
      const rect = { left: Math.max(bounds.left, Math.min(current.x, event.clientX)),
        right: Math.min(bounds.right, Math.max(current.x, event.clientX)),
        top: Math.max(bounds.top, Math.min(current.y, event.clientY)), bottom: Math.min(bounds.bottom, Math.max(current.y, event.clientY)) };
      current.ids = [...current.team.querySelectorAll('[data-root-atom]')]
        .filter(element => intersects(rect, element.getBoundingClientRect())).map(element => element.dataset.rootAtom);
      setSelected(current.ids);
      setGesture({ kind: 'marquee', rect });
    }
  }
  function finish(event) {
    const current = pending.current;
    if (!current || event.pointerId !== current.pointerId) return;
    pending.current = null;
    if (board.current.hasPointerCapture(event.pointerId)) board.current.releasePointerCapture(event.pointerId);
    setGesture(null);
    if (current.kind === 'move') {
      if (current.moved && current.target) { onMove(current.moving, current.target); setSelected([]); }
      else if (!current.moved) select(current.moving.id, current.additive);
    } else if (current.moved) {
      const grouped = groupSelection(rules, current.ids || []);
      if (grouped) { onRules(grouped.rules); setSelected([grouped.groupId]); setNotice('Created condition group.'); }
      else setNotice('Select an ungrouped player, or separate cells/groups, to create a group.');
    } else setSelected([]);
  }
  function cancel() {
    const current = pending.current;
    pending.current = null;
    if (current && board.current?.hasPointerCapture(current.pointerId)) board.current.releasePointerCapture(current.pointerId);
    setGesture(null);
  }
  return { board, gesture, selected, setSelected, notice, setNotice, select, begin,
    boardEvents: { onPointerDown: event => begin(event), onPointerMove: motion, onPointerUp: finish,
      onPointerCancel: cancel, onLostPointerCapture: cancel, onKeyDown: event => {
        if (event.key === 'Escape') { cancel(); setSelected([]); }
      } } };
}
