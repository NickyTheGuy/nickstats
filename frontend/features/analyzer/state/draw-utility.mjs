import { utilitySelectionEvents } from './selection-targets.mjs';
import { onLevel, sampleIndex, worldToRadar } from './replay.mjs';
import {
  effectEnd,
  projectilePosition,
  utilityVisible,
  UTILITY_COLORS,
  UTILITY_ICONS,
} from './utility.mjs';

function drawIcon(ctx, icon, x, y, color) {
  ctx.fillStyle = '#111b28';
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (icon) {
    const ratio = 20 / Math.max(icon.naturalWidth, icon.naturalHeight);
    ctx.drawImage(
      icon,
      x - (icon.naturalWidth * ratio) / 2,
      y - (icon.naturalHeight * ratio) / 2,
      icon.naturalWidth * ratio,
      icon.naturalHeight * ratio,
    );
  }
}
function drawProjectileTrail(ctx, projectile, time, map, level) {
  let previous = null;
  const end = sampleIndex(projectile.samples, Math.min(time, projectile.end));
  ctx.strokeStyle = UTILITY_COLORS[projectile.type];
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = Math.max(0, sampleIndex(projectile.samples, time - 1000)); i <= end; i++) {
    const s = projectile.samples[i];
    if (time - s[0] > 1000 || !onLevel(level, s[3])) {
      previous = null;
      continue;
    }
    const p = worldToRadar(map, s[1], s[2]);
    if (!previous || s[0] - previous[0] > 150) ctx.moveTo(...p);
    else ctx.lineTo(...p);
    previous = s;
  }
  ctx.stroke();
}
export function drawUtility(
  ctx,
  round,
  { time, map, level, selected, side, utilities, icons, allSelected },
) {
  const visible = (item) =>
    utilities.includes(item.type) &&
    (item.player || allSelected) &&
    utilityVisible(item, round, selected, side);
  for (const projectile of round.projectiles || []) {
    if (!visible(projectile) || time > projectile.end + 1000) continue;
    drawProjectileTrail(ctx, projectile, time, map, level);
    const s = projectilePosition(projectile, time);
    if (s && onLevel(level, s[3])) {
      const [x, y] = worldToRadar(map, s[1], s[2]);
      drawIcon(ctx, icons[projectile.icon], x, y, UTILITY_COLORS[projectile.type]);
    }
  }
  for (const effect of round.utility) {
    if (
      !visible(effect) ||
      time < effect.time ||
      time >= effectEnd(effect, round.duration) ||
      !onLevel(level, effect.z)
    )
      continue;
    const [x, y] = worldToRadar(map, effect.x, effect.y),
      color = UTILITY_COLORS[effect.type];
    if (effect.type === 'Smoke' || effect.type === 'Fire') {
      const radius = (effect.radius || (effect.type === 'Smoke' ? 144 : 120)) / map.scale,
        alpha = ctx.globalAlpha;
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.globalAlpha = alpha * 0.22;
      ctx.fill();
      ctx.globalAlpha = alpha;
      ctx.stroke();
    } else drawIcon(ctx, icons[effect.icon || UTILITY_ICONS[effect.type]], x, y, color);
  }
}

export function drawUtilityHistory(
  ctx,
  round,
  {
    time,
    startTime = 0,
    map,
    level,
    selected,
    side,
    utilities,
    icons,
    target,
    allSelected,
    liveEffects = false,
  },
) {
  for (const effect of utilitySelectionEvents(round, {
    time,
    level,
    selected,
    side,
    utilities,
    target: target || 'All',
    allSelected,
  })) {
    if (effect.time < startTime) continue;
    if (
      liveEffects &&
      time < effectEnd(effect, round.duration) &&
      !['Smoke', 'Fire'].includes(effect.type)
    )
      continue;
    const [x, y] = worldToRadar(map, effect.x, effect.y);
    drawIcon(
      ctx,
      icons[effect.icon || UTILITY_ICONS[effect.type]],
      x,
      y,
      UTILITY_COLORS[effect.type],
    );
  }
}
