import { useLayoutEffect, useRef } from "react";

const groupGap = 12;
const imageGap = 6;

function columnWidth(width: number, columns: number, gap: number) {
  return (width - (columns - 1) * gap) / columns;
}

function arrangeImages(grid: HTMLElement, cells: HTMLElement[], width: number, reserved: number) {
  const capacity = Math.max(1, Math.floor((width + imageGap) / (150 + imageGap)));
  // Avoid a four-plus-two split when three equal-width columns can hold six images.
  const columns = Math.ceil(reserved / Math.ceil(reserved / capacity));
  const tileWidth = columnWidth(width, columns, imageGap);
  const bottoms = Array<number>(columns).fill(0);
  for (const cell of cells) {
    const lane = bottoms.indexOf(Math.min(...bottoms));
    const height = tileWidth / Number(cell.dataset.ratio);
    cell.style.width = `${tileWidth}px`;
    cell.style.height = `${height}px`;
    cell.style.left = `${lane * (tileWidth + imageGap)}px`;
    cell.style.top = `${bottoms[lane]}px`;
    bottoms[lane] += height + imageGap;
  }
  grid.style.height = `${Math.max(...bottoms) - imageGap}px`;
}

interface RequestGroup {
  card: HTMLElement;
  images: HTMLElement;
  cells: HTMLElement[];
}

interface Reservation {
  card: HTMLElement;
  count: number;
  reserved: number;
  span: number;
}

interface Sizing {
  capacity: number;
  columns: number;
  laneWidth: number;
  reservations: Reservation[];
}

function sizeGroups(groups: RequestGroup[], width: number, last: Sizing | undefined): Sizing {
  const capacity = Math.max(1, Math.floor((width + groupGap) / (248 + groupGap)));
  const maxSpan = Math.max(1, capacity - (groups.length > 1 ? 1 : 0));
  // Late results can add tiles to a card without increasing its reserved width.
  const reuse =
    last?.capacity === capacity &&
    last.reservations.length === groups.length &&
    groups.every(
      ({ card, cells }, i) => card === last.reservations[i].card && cells.length >= last.reservations[i].count,
    );
  let remaining = capacity;
  const reservations = groups.map(({ card, cells }, i) => {
    const span = reuse ? last.reservations[i].span : Math.min(maxSpan, Math.ceil(Math.sqrt(cells.length)), remaining);
    remaining = remaining - span || capacity;
    return { card, span, count: cells.length, reserved: reuse ? last.reservations[i].reserved : cells.length };
  });
  const columns = Math.min(
    capacity,
    reservations.reduce((sum, { span }) => sum + span, 0),
  );
  const availableLane = columnWidth(width, columns, groupGap);
  const laneWidth = columns < capacity ? Math.min(380, availableLane) : availableLane;
  for (const { card, span } of reservations) card.style.width = `${span * laneWidth + (span - 1) * groupGap}px`;
  const widths = groups.map(({ images }) => images.getBoundingClientRect().width);
  groups.forEach(({ images, cells }, i) => arrangeImages(images, cells, widths[i], reservations[i].reserved));
  return { capacity, columns, laneWidth, reservations };
}

interface Slot {
  lane: number;
  top: number;
}

interface Footprint extends Slot {
  span: number;
  end: number; // Includes the gap below the card.
}

function packGroups(columns: number, spans: number[], heights: number[], anchor?: { index: number; slot: Slot }) {
  // Keep footprints sorted by top so each candidate span can scan for its first fitting gap.
  const placed: Footprint[] = [];
  if (anchor) {
    const { index, slot } = anchor;
    placed.push({ ...slot, span: spans[index], end: slot.top + heights[index] + groupGap });
  }
  return spans.map((span, i): Slot => {
    if (i === anchor?.index) return anchor.slot;
    const height = heights[i] + groupGap;
    let best: Slot = { lane: 0, top: Infinity };
    for (let lane = 0; lane + span <= columns && best.top > 0; lane++) {
      let top = 0;
      for (const box of placed) {
        if (top >= best.top || top + height <= box.top) break;
        if (lane < box.lane + box.span && box.lane < lane + span) top = Math.max(top, box.end);
      }
      if (top < best.top) best = { lane, top };
    }
    const insertionIndex = placed.findIndex(({ top }) => top > best.top);
    placed.splice(insertionIndex < 0 ? placed.length : insertionIndex, 0, { ...best, span, end: best.top + height });
    return best;
  });
}

export function useRequestMasonry(structure: string) {
  const host = useRef<HTMLDivElement>(null);
  const previousSizing = useRef<Sizing>(undefined);
  useLayoutEffect(() => {
    const grid = host.current;
    if (!grid?.children.length) {
      previousSizing.current = undefined;
      grid?.style.removeProperty("height");
      return;
    }
    const groups = Array.from(grid.children, (child) => {
      const card = child as HTMLElement;
      const images = card.querySelector<HTMLElement>(".request-images")!;
      return { card, images, cells: Array.from(images.children) as HTMLElement[] };
    });
    let layoutWidth = 0;
    let sizing: Sizing | undefined;
    let heights: number[] = [];
    let slots: Slot[] = [];
    const arrange = () => {
      const width = grid.clientWidth;
      if (!width) return;
      const sameWidth = layoutWidth === width;
      if (!sizing || !sameWidth) {
        sizing = sizeGroups(groups, width, previousSizing.current);
        previousSizing.current = sizing;
      }

      const nextHeights = groups.map(({ card }) => card.getBoundingClientRect().height);
      const resizedIndex = sameWidth ? nextHeights.findIndex((height, i) => height !== heights[i]) : -1;
      if (sameWidth && resizedIndex < 0) return;

      // Keep a growing card in place when the other card sizes are stable.
      const anchor =
        resizedIndex >= 0 &&
        nextHeights[resizedIndex] > heights[resizedIndex] &&
        nextHeights.every((height, i) => i === resizedIndex || height === heights[i])
          ? { index: resizedIndex, slot: slots[resizedIndex] }
          : undefined;
      const { columns, laneWidth, reservations } = sizing;
      slots = packGroups(
        columns,
        reservations.map(({ span }) => span),
        nextHeights,
        anchor,
      );
      let height = 0;
      groups.forEach(({ card }, i) => {
        const { lane, top } = slots[i];
        card.style.left = `${lane * (laneWidth + groupGap)}px`;
        card.style.top = `${top}px`;
        height = Math.max(height, top + nextHeights[i]);
      });
      grid.style.height = `${height}px`;
      layoutWidth = width;
      heights = nextHeights;
    };
    arrange();
    const observer = new ResizeObserver(arrange);
    observer.observe(grid.parentElement!);
    groups.forEach(({ card }) => observer.observe(card, { box: "border-box" }));
    return () => observer.disconnect();
  }, [structure]);
  return host;
}
