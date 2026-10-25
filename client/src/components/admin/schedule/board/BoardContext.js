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
});

export const useBoard = () => useContext(BoardContext);
