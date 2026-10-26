import { createContext, useContext } from 'react';

/**
 * What every Board cell and block needs without threading props through the
 * table: lazy detail lookups (computed only when a popover opens), the
 * open-drawer handlers, the search term and the in-flight drag.
 */
export const BoardContext = createContext({
  getOrderDetail: () => null,
  getLorryDetail: () => null,
  openOrder: () => {},
  openLorry: () => {},
  openSlot: () => {},
  matchesSearch: () => true,
  searching: false,
  dragActive: false,
  // Salespeople view; only `schedule_edit` may drag, approve, reject or move.
  canEdit: true,
});

export const useBoard = () => useContext(BoardContext);
