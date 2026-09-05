/** Share the bottom edge with existing actions instead of placing a second dock over them. */
export interface DockObstacle {
  left: number; right: number; height: number; bottom: number;
  position: string; display: string; visibility: string; pointerEvents: string;
}
export function orderDockBottom(left: number, right: number, obstacles: readonly DockObstacle[], gap = 12): number {
  let bottom = 0;
  for (const item of obstacles) {
    if (item.position !== 'fixed' || item.display === 'none' || item.visibility === 'hidden' || item.pointerEvents === 'none') continue;
    if (![item.left, item.right, item.height, item.bottom].every(Number.isFinite)) continue;
    if (item.height <= 0 || item.right <= left || item.left >= right) continue;
    bottom = Math.max(bottom, Math.max(0, item.bottom) + item.height + gap);
  }
  return Math.ceil(bottom);
}
interface DockController { add(node: HTMLElement): () => void }
const controllerKey = Symbol.for('robys.order-dock.v1');
const blockerSelector = '.mobile-cta,.mobile-quickbar';

/** One controller per document, including the lazy-launcher → drawer handoff. */
export function installOrderDock(node: HTMLElement): () => void {
  const doc = node.ownerDocument as Document & { [key: symbol]: DockController | undefined };
  const active = doc[controllerKey];
  if (active) return active.add(node);
  const win = doc.defaultView;
  if (!win) return () => {};
  const bars = new Set<HTMLElement>();
  let blockers: HTMLElement[] = [];
  let pending: number | null = null;
  let disposed = false;
  const root = doc.documentElement;
  const properties = ['--robys-order-obstruction', '--robys-order-page-clearance'];
  const set = (key: string, value: number) => {
    const css = `${Math.ceil(value)}px`;
    if (root.style.getPropertyValue(key) !== css) root.style.setProperty(key, css);
  };
  const schedule = () => {
    if (!disposed && pending === null) pending = win.requestAnimationFrame(measure);
  };
  const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
  const attributes = new MutationObserver(schedule);
  const refreshBlockers = () => {
    for (const item of blockers) resize?.unobserve(item);
    attributes.disconnect();
    attributes.observe(doc.body, { attributes: true, attributeFilter: ['class'] });
    blockers = Array.from(doc.querySelectorAll<HTMLElement>(blockerSelector));
    for (const item of blockers) {
      resize?.observe(item);
      attributes.observe(item, { attributes: true, attributeFilter: ['class', 'hidden', 'style'] });
    }
  };
  const tree = new MutationObserver(records => {
    let changed = false;
    for (const record of records) for (const item of [...record.addedNodes, ...record.removedNodes]) {
      if (!(item instanceof Element)) continue;
      if (item.matches(blockerSelector) || item.querySelector(blockerSelector)) changed = true;
      if ([...bars].some(bar => item === bar || item.contains(bar))) changed = true;
    }
    if (changed) { refreshBlockers(); schedule(); }
  });
  function dispose() {
    if (disposed) return;
    disposed = true;
    if (pending !== null) win!.cancelAnimationFrame(pending);
    resize?.disconnect(); attributes.disconnect(); tree.disconnect();
    win!.removeEventListener('resize', schedule);
    win!.removeEventListener('pageshow', schedule);
    win!.visualViewport?.removeEventListener('resize', schedule);
    doc.removeEventListener('transitionrun', schedule);
    doc.removeEventListener('transitionend', schedule);
    for (const property of properties) root.style.removeProperty(property);
    delete doc[controllerKey];
  }
  function measure() {
    pending = null;
    for (const bar of bars) if (!bar.isConnected) { resize?.unobserve(bar); bars.delete(bar); }
    if (!bars.size) { dispose(); return; }
    let lane = 0;
    const heights: Array<[HTMLElement, number]> = [];
    for (const bar of bars) {
      const box = bar.getBoundingClientRect();
      const obstacles = blockers.map(blocker => {
        const rect = blocker.getBoundingClientRect(), style = win!.getComputedStyle(blocker);
        // Use layout bottom, not the sliding transform: reserve the lane from
        // transition start. Otherwise a moving toolbar can cross the cart.
        return { left: rect.left, right: rect.right, height: rect.height,
          bottom: Number.parseFloat(style.bottom), position: style.position,
          display: style.display, visibility: style.visibility, pointerEvents: style.pointerEvents };
      });
      const next = orderDockBottom(box.left, box.right, obstacles);
      lane = Math.max(lane, next);
      heights.push([bar, box.height]);
    }
    set(properties[0], lane);
    // Read the resolved CSS bottom after setting the lane: this includes the
    // device safe area without guessing or counting it twice.
    const occupied = Math.max(...heights.map(([bar, height]) =>
      (Number.parseFloat(win!.getComputedStyle(bar).bottom) || 14) + height + 12));
    set(properties[1], occupied);
  }
  const controller: DockController = {
    add(bar) {
      bars.add(bar); resize?.observe(bar); schedule();
      return () => { bars.delete(bar); resize?.unobserve(bar); if (bars.size) schedule(); else dispose(); };
    }
  };
  Object.defineProperty(doc, controllerKey, { configurable: true, value: controller });
  refreshBlockers();
  tree.observe(doc.body, { childList: true, subtree: true });
  win.addEventListener('resize', schedule, { passive: true });
  win.addEventListener('pageshow', schedule);
  win.visualViewport?.addEventListener('resize', schedule, { passive: true });
  doc.addEventListener('transitionrun', schedule, { passive: true });
  doc.addEventListener('transitionend', schedule, { passive: true });
  void doc.fonts?.ready.then(schedule);
  return controller.add(node);
}
