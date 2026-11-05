/**
 * Handsontable's drag sometimes grows the highlight on only one axis.
 * Track the mouse-down cell and always select the rectangle to the cell under the pointer.
 */
export function rectSelectionHooks() {
  let anchor = null;

  return {
    afterOnCellMouseDown(event, coords) {
      const el = event?.target;
      if (el?.classList?.contains('corner')) {
        anchor = null;
        return;
      }
      if (!coords || coords.row < 0 || coords.col < 0) {
        anchor = null;
        return;
      }
      anchor = { row: coords.row, col: coords.col };
    },
    afterOnCellMouseOver(event, coords) {
      if (!anchor || !event || event.buttons !== 1) return;
      if (!coords || coords.row < 0 || coords.col < 0) return;
      if (coords.row === anchor.row && coords.col === anchor.col) return;
      this.selectCells([[anchor.row, anchor.col, coords.row, coords.col]], false, false);
    },
    afterOnCellMouseUp() {
      anchor = null;
    }
  };
}
