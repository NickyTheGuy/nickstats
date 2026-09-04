(() => {
  "use strict";

  function svgEl(tag, attributes = {}, text) {
    const item = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.entries(attributes).forEach(([key, value]) => item.setAttribute(key, value));
    if (text !== undefined) item.textContent = text;
    return item;
  }
  
  function renderImpactChart(analysis, helpers) {
    const { $, summarize, signed } = helpers;
    const svg = $("impactChart");
    svg.replaceChildren(
      svgEl("title", { id: "chartTitle" }, "Lifter and dragger impact versus personal performance"),
      svgEl("desc", { id: "chartDescription" }, "A labeled scatterplot comparing each player’s groupwide teammate impact score with their own average CSStats rating.")
    );
  
    const width = 1080, height = 580;
    const margin = { top: 38, right: 42, bottom: 76, left: 78 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const points = analysis.overall.map(item => ({
      ...item,
      personalRating: summarize(item.player.rows).rating
    }));
    const maxAbs = Math.max(.4, ...points.map(point => Math.abs(point.score))) * 1.18;
    const ratings = points.map(point => point.personalRating);
    const ratingLow = Math.min(1, ...ratings);
    const ratingHigh = Math.max(1, ...ratings);
    const ratingSpan = Math.max(.25, ratingHigh - ratingLow);
    const yMin = Math.max(0, ratingLow - ratingSpan * .18);
    const yMax = ratingHigh + ratingSpan * .18;
    const x = value => margin.left + (value + maxAbs) / (2 * maxAbs) * innerWidth;
    const y = value => margin.top + (yMax - value) / (yMax - yMin) * innerHeight;
    const xZero = x(0), yNeutral = y(1);
  
    const quadrants = [
      { x: margin.left, y: margin.top, w: xZero - margin.left, h: yNeutral - margin.top, fill: "rgba(104,164,255,.055)", title: "SOLO STAR", subtitle: "Strong personally · teammates decline" },
      { x: xZero, y: margin.top, w: width - margin.right - xZero, h: yNeutral - margin.top, fill: "rgba(98,212,157,.065)", title: "CARRY", subtitle: "Strong personally · lifts teammates" },
      { x: margin.left, y: yNeutral, w: xZero - margin.left, h: height - margin.bottom - yNeutral, fill: "rgba(255,122,131,.065)", title: "LIABILITY", subtitle: "Modest stats · teammates decline" },
      { x: xZero, y: yNeutral, w: width - margin.right - xZero, h: height - margin.bottom - yNeutral, fill: "rgba(255,201,105,.055)", title: "GLUE PLAYER", subtitle: "Modest stats · lifts teammates" }
    ];
  
    quadrants.forEach(quadrant => {
      svg.appendChild(svgEl("rect", { x: quadrant.x, y: quadrant.y, width: quadrant.w, height: quadrant.h, fill: quadrant.fill }));
      const centerX = quadrant.x + quadrant.w / 2;
      const centerY = quadrant.y + quadrant.h / 2;
      svg.appendChild(svgEl("text", { x: centerX, y: centerY - 5, fill: "rgba(255,255,255,.18)", "font-size": 23, "font-weight": 900, "text-anchor": "middle", "letter-spacing": 2 }, quadrant.title));
      svg.appendChild(svgEl("text", { x: centerX, y: centerY + 18, fill: "rgba(255,255,255,.20)", "font-size": 11, "text-anchor": "middle" }, quadrant.subtitle));
    });
  
    const grid = svgEl("g", { "aria-hidden": "true" });
    const xTicks = [-maxAbs, -maxAbs / 2, 0, maxAbs / 2, maxAbs];
    xTicks.forEach(value => {
      const px = x(value);
      grid.appendChild(svgEl("line", { x1: px, y1: margin.top, x2: px, y2: height - margin.bottom, stroke: value === 0 ? "rgba(255,255,255,.36)" : "rgba(255,255,255,.09)", "stroke-width": value === 0 ? 1.5 : 1 }));
      grid.appendChild(svgEl("text", { x: px, y: height - margin.bottom + 24, fill: "#8290a4", "font-size": 11, "text-anchor": "middle" }, value.toFixed(2)));
    });
    for (let index = 0; index < 5; index++) {
      const value = yMin + (yMax - yMin) * index / 4;
      const py = y(value);
      grid.appendChild(svgEl("line", { x1: margin.left, y1: py, x2: width - margin.right, y2: py, stroke: "rgba(255,255,255,.09)", "stroke-width": 1 }));
      grid.appendChild(svgEl("text", { x: margin.left - 13, y: py + 4, fill: "#8290a4", "font-size": 11, "text-anchor": "end" }, value.toFixed(2)));
    }
    grid.appendChild(svgEl("line", { x1: margin.left, y1: yNeutral, x2: width - margin.right, y2: yNeutral, stroke: "rgba(255,255,255,.38)", "stroke-width": 1.5, "stroke-dasharray": "6 5" }));
    grid.appendChild(svgEl("text", { x: width - margin.right - 5, y: yNeutral - 8, fill: "#aab5c5", "font-size": 10, "text-anchor": "end" }, "1.00 rating"));
    svg.appendChild(grid);
  
    svg.appendChild(svgEl("text", { x: margin.left + innerWidth / 2, y: height - 20, fill: "#b7c2d1", "font-size": 13, "font-weight": 700, "text-anchor": "middle" }, "Teammate impact score  ·  Dragger ← 0 → Lifter"));
    const yLabel = svgEl("text", { x: 21, y: margin.top + innerHeight / 2, fill: "#b7c2d1", "font-size": 13, "font-weight": 700, "text-anchor": "middle", transform: `rotate(-90 21 ${margin.top + innerHeight / 2})` }, "Personal average rating");
    svg.appendChild(yLabel);
  
    const labelBoxes = [];
    const pointColors = { Lifter: "#62d49d", Exister: "#ffc969", Dragger: "#ff7a83" };
    const candidates = [
      { dx: 13, dy: -11, anchor: "start" }, { dx: 13, dy: 21, anchor: "start" },
      { dx: -13, dy: -11, anchor: "end" }, { dx: -13, dy: 21, anchor: "end" },
      { dx: 0, dy: -18, anchor: "middle" }, { dx: 0, dy: 29, anchor: "middle" }
    ];
  
    points.slice().sort((a, b) => b.personalRating - a.personalRating).forEach(point => {
      const px = x(point.score), py = y(point.personalRating);
      const group = svgEl("g", { tabindex: "0", role: "img", "aria-label": `${point.player.label}: impact ${point.score.toFixed(2)}, personal rating ${point.personalRating.toFixed(2)}, ${point.classification}` });
      group.appendChild(svgEl("title", {}, `${point.player.label} — ${point.classification}\nImpact: ${point.score.toFixed(3)}\nPersonal rating: ${point.personalRating.toFixed(3)}\nTeammate win-rate change: ${signed(point.delta.winRate, 1, " pp")}`));
      group.appendChild(svgEl("circle", { cx: px, cy: py, r: 14, fill: pointColors[point.classification], opacity: .13 }));
      group.appendChild(svgEl("circle", { cx: px, cy: py, r: 7, fill: pointColors[point.classification], stroke: "#08101a", "stroke-width": 2 }));
  
      const estimatedWidth = Math.max(34, point.player.label.length * 7.2);
      let chosen = candidates[0], box;
      for (const candidate of candidates) {
        const left = candidate.anchor === "start" ? px + candidate.dx : candidate.anchor === "end" ? px + candidate.dx - estimatedWidth : px - estimatedWidth / 2;
        const top = py + candidate.dy - 13;
        const proposed = { left, right: left + estimatedWidth, top, bottom: top + 18 };
        const inside = proposed.left > margin.left && proposed.right < width - margin.right && proposed.top > margin.top && proposed.bottom < height - margin.bottom;
        const clear = labelBoxes.every(existing => proposed.right < existing.left || proposed.left > existing.right || proposed.bottom < existing.top || proposed.top > existing.bottom);
        if (inside && clear) { chosen = candidate; box = proposed; break; }
      }
      if (!box) {
        const left = chosen.anchor === "start" ? px + chosen.dx : px + chosen.dx - estimatedWidth;
        box = { left, right: left + estimatedWidth, top: py + chosen.dy - 13, bottom: py + chosen.dy + 5 };
      }
      labelBoxes.push(box);
      group.appendChild(svgEl("text", { x: px + chosen.dx, y: py + chosen.dy, fill: "#f5f7fb", "font-size": 12, "font-weight": 800, "text-anchor": chosen.anchor, stroke: "#0c111a", "stroke-width": 3, "paint-order": "stroke" }, point.player.label));
      svg.appendChild(group);
    });
  }
  

  window.CSStatsChart = Object.freeze({ renderImpactChart });
})();
