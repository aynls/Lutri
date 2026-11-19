import { useLayoutEffect, useRef } from "react";

const groupGap = 12;
const imageGap = 6;

function columnWidth(width: number, columns: number, gap: number) {
  return (width - (columns - 1) * gap) / columns;
}

// Among adjacent lanes, use the first span with the lowest available top.
function shortestSpan(bottoms: number[], span: number) {
  let best = 0;
  let lowest = Infinity;
  for (let start = 0; start <= bottoms.length - span; start++) {
    const top = Math.max(...bottoms.slice(start, start + span));
    if (top < lowest) {
      best = start;
      lowest = top;
    }
  }
  return best;
}

function arrangeImages(grid: HTMLElement, cells: HTMLElement[], width: number, reserved: number) {
  const capacity = Math.max(1, Math.floor((width + imageGap) / (150 + imageGap)));
  // Avoid a four-plus-two split when three equal-width columns can hold six images.
  const columns = Math.ceil(reserved / Math.ceil(reserved / capacity));
  const tileWidth = columnWidth(width, columns, imageGap);
  const bottoms = Array<number>(columns).fill(0);
  for (const cell of cells) {
    const lane = shortestSpan(bottoms, 1);
    const height = tileWidth / Number(cell.dataset.ratio);
    cell.style.width = `${tileWidth}px`;
    cell.style.height = `${height}px`;
    cell.style.left = `${lane * (tileWidth + imageGap)}px`;
    cell.style.top = `${bottoms[lane]}px`;
    bottoms[lane] += height + imageGap;
  }
  grid.style.height = `${Math.max(...bottoms) - imageGap}px`;
}

interface Placement {
  card: HTMLElement;
  count: number;
  reserved: number;
  lane: number;
  span: number;
}

export function useRequestMasonry(structure: string) {
  const host = useRef<HTMLDivElement>(null);
  const previous = useRef<{ columns: number; placements: Placement[] }>(undefined);
  useLayoutEffect(() => {
    const grid = host.current;
    if (!grid) {
      previous.current = undefined;
      return;
    }
    const groups = Array.from(grid.children, (child) => {
      const card = child as HTMLElement;
      const images = card.querySelector<HTMLElement>(".request-images")!;
      return { card, images, cells: Array.from(images.children) as HTMLElement[] };
    });
    const arrange = () => {
      const width = grid.clientWidth;
      if (!width || !groups.length) return;
      const columns = Math.max(1, Math.floor((width + groupGap) / (248 + groupGap)));
      const desired = groups.map(({ cells }) => Math.ceil(Math.sqrt(cells.length)));
      const maxSpan = Math.max(1, columns - (groups.length > 1 ? 1 : 0));
      const last = previous.current;
      // Late/extra results and delivery diagnostics may grow a group. Keep existing
      // groups in their lanes until the user removes items or the column count changes.
      const reuse =
        last?.columns === columns &&
        last.placements.length === groups.length &&
        groups.every(
          ({ card, cells }, i) => card === last.placements[i].card && cells.length >= last.placements[i].count,
        );
      let remaining = columns;
      const placements = groups.map(({ card, cells }, i) => {
        const span = reuse ? last.placements[i].span : Math.min(maxSpan, desired[i], remaining);
        remaining = remaining - span || columns;
        return {
          card,
          span,
          count: cells.length,
          reserved: reuse ? last.placements[i].reserved : cells.length,
          lane: reuse ? last.placements[i].lane : 0,
        };
      });
      const occupied = Math.min(
        columns,
        placements.reduce((sum, { span }) => sum + span, 0),
      );
      const availableLane = columnWidth(width, occupied, groupGap);
      const laneWidth = occupied < columns ? Math.min(380, availableLane) : availableLane;
      for (const { card, span } of placements) card.style.width = `${span * laneWidth + (span - 1) * groupGap}px`;
      // Size both levels before measuring headers, translated text and delivery errors.
      const widths = groups.map(({ images }) => images.getBoundingClientRect().width);
      groups.forEach(({ images, cells }, i) => arrangeImages(images, cells, widths[i], placements[i].reserved));
      const heights = groups.map(({ card }) => card.getBoundingClientRect().height);
      const bottoms = Array<number>(occupied).fill(0);
      let previousTop = 0;
      placements.forEach((placement, i) => {
        const { card, span } = placement;
        if (!reuse) placement.lane = shortestSpan(bottoms, span);
        const lane = placement.lane;
        const top = Math.max(previousTop, ...bottoms.slice(lane, lane + span));
        card.style.left = `${lane * (laneWidth + groupGap)}px`;
        card.style.top = `${top}px`;
        bottoms.fill(top + heights[i] + groupGap, lane, lane + span);
        previousTop = top;
      });
      grid.style.height = `${Math.max(...bottoms) - groupGap}px`;
      previous.current = { columns, placements };
    };
    arrange();
    const observer = new ResizeObserver(arrange);
    observer.observe(grid.parentElement!);
    groups.forEach(({ card }) => observer.observe(card, { box: "border-box" }));
    return () => observer.disconnect();
  }, [structure]);
  return host;
}
