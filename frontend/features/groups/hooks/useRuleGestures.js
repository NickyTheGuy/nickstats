import { useRef, useState } from 'react';
import { findRule, groupSelection, selectionRoots, ungroupCondition } from '../state/editing.mjs';

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
    const hit = event.target.closest('[data-movable-id]');
    const cell = hit && (hit.classList.contains('group-rule-player') || event.target.closest('.group-cluster-heading')) ? hit : null;
    let moving = move || (cell ? { id: cell.dataset.movableId } : null);
    const pressedId = moving?.id;
    if (moving) {
      const path = findRule(rules, moving.id)?.path || [];
      const selectedAncestor = path.slice().reverse().find(id => selected.includes(id));
      const ownsSelection = selected.includes(moving.id) || selectedAncestor;
      const ids = selectionRoots(rules, ownsSelection ? selected : [moving.id]);
      if (!ids?.length) return;
      moving = { id: selectedAncestor || moving.id, ids };
    }
    const container = event.target.closest('[data-drop-group]');
    if (!moving && (!container || event.pointerType === 'touch')) return;
    event.preventDefault(); event.stopPropagation();
    board.current.setPointerCapture(event.pointerId);
    pending.current = { kind: moving ? 'move' : 'marquee', moving, pressedId, container, x: event.clientX, y: event.clientY,
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
      setSelected(current.moving.ids);
      setGesture({ kind: 'move', x: event.clientX, y: event.clientY, target: current.target, moving: current.moving });
    } else {
      const bounds = current.container.getBoundingClientRect();
      const rect = { left: Math.max(bounds.left, Math.min(current.x, event.clientX)),
        right: Math.min(bounds.right, Math.max(current.x, event.clientX)),
        top: Math.max(bounds.top, Math.min(current.y, event.clientY)), bottom: Math.min(bounds.bottom, Math.max(current.y, event.clientY)) };
      const cells = current.container.querySelector(':scope > .group-cluster-cells');
      current.ids = [...(cells?.children || [])]
        .filter(element => element.dataset.movableId && intersects(rect, element.getBoundingClientRect()))
        .map(element => element.dataset.movableId);
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
      if (current.moved && current.target) {
        onMove(current.moving, current.target);
        setSelected(current.moving.ids);
      } else if (!current.moved) select(current.pressedId, current.additive);
    } else if (current.moved) {
      const grouped = groupSelection(rules, current.ids || []);
      if (grouped) { onRules(grouped.rules); setSelected([grouped.groupId]); }
    } else setSelected([]);
  }
  function cancel() {
    const current = pending.current;
    pending.current = null;
    if (current && board.current?.hasPointerCapture(current.pointerId)) board.current.releasePointerCapture(current.pointerId);
    setGesture(null);
  }
  function keyboard(event) {
    if (event.key === 'Escape') { cancel(); setSelected([]); return; }
    if (!(event.ctrlKey || event.metaKey) || !selected.length) return;
    if (event.key.toLowerCase() === 'g') {
      event.preventDefault();
      if (event.shiftKey) {
        let changed = rules;
        for (const id of selectionRoots(rules, selected) || []) changed = ungroupCondition(changed, id);
        if (changed !== rules) { onRules(changed); setSelected([]); }
      } else {
        const grouped = groupSelection(rules, selected);
        if (grouped) { onRules(grouped.rules); setSelected([grouped.groupId]); }
      }
    } else if (event.shiftKey && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      const ids = selectionRoots(rules, selected);
      if (ids?.length) onMove({ id: ids[0], ids }, event.key === 'ArrowLeft' ? rules.friendly.id : rules.enemy.id);
    }
  }
  return { board, gesture, selected, setSelected, notice, setNotice, select, begin,
    boardEvents: { onPointerDown: event => begin(event), onPointerMove: motion, onPointerUp: finish,
      onPointerCancel: cancel, onLostPointerCapture: cancel, onKeyDown: keyboard } };
}
