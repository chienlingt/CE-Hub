// The mock/live seam. ScheduleProvider is the only file that imports this.

import { resolveDataSource } from './dataSource';
import { assertGateway } from './scheduleGateway';
import mockScheduleGateway from './mockScheduleGateway';
import liveScheduleGateway from './liveScheduleGateway';

/**
 * @param {URLSearchParams|null} searchParams
 * @returns {{gateway: object, source: 'mock'|'live', blocked: boolean}}
 */
export function getScheduleGateway(searchParams) {
  const { source, blocked } = resolveDataSource(searchParams);
  const gateway = source === 'mock' ? mockScheduleGateway : liveScheduleGateway;
  return { gateway: assertGateway(gateway, `${source}ScheduleGateway`), source, blocked };
}

export { resolveDataSource } from './dataSource';
export { GATEWAY_METHODS, assertGateway } from './scheduleGateway';
