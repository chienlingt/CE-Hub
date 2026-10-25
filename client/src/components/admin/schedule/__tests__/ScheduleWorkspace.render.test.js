// Mount smoke tests.
//
// A deliberate, narrow exception to "pure-logic tests only": `npm run build`
// cannot catch a runtime error, and a white screen in front of stakeholders is
// the failure mode that matters most. These mount the real workspace against
// the real mock gateway and assert the grid and dashboard actually render.
//
// Still no drag interaction tests — jsdom gives @dnd-kit no pointer events or
// bounding boxes, which is the time sink the plan calls out.

import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ScheduleWorkspace from '../ScheduleWorkspace';
import ScheduleApproval from '../ScheduleApproval';
import SchedulerSettings from '../SchedulerSettings';
import mockScheduleGateway from '../../../../services/schedule/mockScheduleGateway';

function renderAt(Component, search) {
  return render(
    <MemoryRouter initialEntries={[`/schedule${search}`]}>
      <Component />
    </MemoryRouter>,
  );
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  // Force the mock gateway regardless of how the shell is configured.
  process.env = { ...ORIGINAL_ENV, REACT_APP_SCHEDULE_DATA_SOURCE: 'mock' };
  mockScheduleGateway.__reset();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

/** The provider loads behind an artificial latency; wait for real content. */
const waitForReady = () => waitFor(
  () => expect(screen.queryByText(/Loading schedule/i)).not.toBeInTheDocument(),
  { timeout: 5000 },
);

describe('ScheduleWorkspace — Today board', () => {
  it('opens on the board by default: every lorry, slot columns and the slot-total row', async () => {
    renderAt(ScheduleWorkspace, '?data=mock&date=2026-10-27');

    const table = await screen.findByRole('table', {}, { timeout: 5000 });
    expect(screen.getByRole('tab', { name: /Today/i })).toHaveAttribute('aria-selected', 'true');
    // Lorry header: number, size, team — nothing else.
    expect(within(table).getByText('WXX 1234')).toBeInTheDocument();
    expect(within(table).getAllByText('Delivery Team A').length).toBeGreaterThan(0);
    // The crewless lorry still shows, flagged.
    expect(within(table).getAllByText('⚠ No team').length).toBeGreaterThan(0);
    // The shared DO cap sits under the slots, not in the lorry rows.
    expect(within(table).getByText(/Slot total/i)).toBeInTheDocument();
    expect(within(table).getByText(/Day \d+ \/ 50/)).toBeInTheDocument();
    // NIGHT is shown but closed until the admin drops a DO into it.
    expect(within(table).getAllByText('No night delivery').length).toBeGreaterThan(0);
  });

  it('shows the unscheduled tray, the legend and the day-level approve action', async () => {
    renderAt(ScheduleWorkspace, '?data=mock&date=2026-10-27');
    await screen.findByRole('table', {}, { timeout: 5000 });

    expect(screen.getAllByRole('region', { name: /Unscheduled DOs/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole('list', { name: /Legend/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Approve all pending/i })).toBeInTheDocument();
  });

  it('has no Run scheduler and no Book a delivery anywhere on the board', async () => {
    renderAt(ScheduleWorkspace, '?data=mock&date=2026-10-27');
    await screen.findByRole('table', {}, { timeout: 5000 });
    expect(screen.queryByRole('button', { name: /Run scheduler/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Book (a delivery|this time)/i)).not.toBeInTheDocument();
  });

  it('opens a DO pinned in the drawer from ?order=', async () => {
    renderAt(ScheduleWorkspace, '?data=mock&date=2026-10-27&order=o-24001');
    const dialog = await screen.findByRole('dialog', {}, { timeout: 5000 });
    expect(within(dialog).getAllByText('DO-24001').length).toBeGreaterThan(0);
  });

  it('opens the lorry card with crew contacts from ?lorry=', async () => {
    renderAt(ScheduleWorkspace, '?data=mock&date=2026-10-27&lorry=tk-01');
    const dialog = await screen.findByRole('dialog', {}, { timeout: 5000 });
    expect(within(dialog).getByText('Driver')).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: /Edit pairing/i })).toHaveAttribute('href', '/info/team');
  });
});

describe('ScheduleWorkspace', () => {
  it('renders the Excel grid with lorry rows and a day-total row', async () => {
    renderAt(ScheduleWorkspace, '?view=grid&data=mock');

    const table = await screen.findByRole('table', {}, { timeout: 5000 });
    expect(table).toBeInTheDocument();

    // Frozen-pane corner header.
    expect(within(table).getByText(/Lorry \/ window/i)).toBeInTheDocument();
    // A real lorry plate from the fixtures.
    expect(within(table).getByText('WXX 1234')).toBeInTheDocument();
    // The SUM() row Mr Lee already has.
    expect(within(table).getByText(/Day total/i)).toBeInTheDocument();
    // Window sub-rows.
    expect(within(table).getAllByText('AM').length).toBeGreaterThan(0);
  });

  it('shows the mock-data badge so nobody mistakes it for live', async () => {
    renderAt(ScheduleWorkspace, '?view=grid&data=mock');
    expect(await screen.findByText(/Mock data/i, {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it('renders the exec dashboard with KPIs, the calendar and the constraint panel', async () => {
    renderAt(ScheduleWorkspace, '?view=exec&data=mock');

    expect(await screen.findByText(/Booked DOs/i, {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText(/Working calendar/i)).toBeInTheDocument();
    expect(screen.getByText(/Weekly capacity vs demand/i)).toBeInTheDocument();
    expect(screen.getByText(/Binding constraints this week/i)).toBeInTheDocument();
  });

  it('renders the exception drawer with conflict reasons', async () => {
    renderAt(ScheduleWorkspace, '?view=grid&data=mock&exceptions=1&scenario=exceptions');

    const dialog = await screen.findByRole('dialog', {}, { timeout: 5000 });
    expect(within(dialog).getByRole('heading', { name: /Exceptions/i })).toBeInTheDocument();
    await waitFor(() => {
      expect(within(dialog).getByText(/need a decision|Nothing outstanding/i)).toBeInTheDocument();
    });
    // The scheduler runs on the Engine page; the drawer only links there.
    expect(within(dialog).queryByRole('button', { name: /Run scheduler/i })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: /Engine/i })).toBeInTheDocument();
  });

  it('refuses live data in a demo build and says so', async () => {
    process.env = { ...ORIGINAL_ENV, REACT_APP_DEMO_AUTH: '1', REACT_APP_SCHEDULE_DATA_SOURCE: 'mock' };
    renderAt(ScheduleWorkspace, '?view=grid&data=live');
    expect(await screen.findByText(/Live data refused/i, {}, { timeout: 5000 })).toBeInTheDocument();
  });
});

describe('ScheduleApproval', () => {
  it('renders Mr Lee’s queue with trips awaiting a decision', async () => {
    renderAt(ScheduleApproval, '?data=mock&scenario=awaitingApproval');
    await waitForReady();

    expect(await screen.findByText(/Schedule approval/i, {}, { timeout: 5000 })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getAllByText(/Approve trip|Approve anyway/i).length).toBeGreaterThan(0);
    }, { timeout: 5000 });
  });
});

describe('SchedulerSettings', () => {
  it('renders the grace-period and capacity controls', async () => {
    renderAt(SchedulerSettings, '?data=mock');

    expect(await screen.findByText(/Scheduler settings/i, {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText(/Grace period and buffers/i)).toBeInTheDocument();
    expect(screen.getByText('Maximum DOs per slot')).toBeInTheDocument();
    // Honest about where the config lives until the migration lands.
    expect(screen.getByText(/Local only/i)).toBeInTheDocument();
  });

  it('shows the fleet without fabricating a payload figure', async () => {
    renderAt(SchedulerSettings, '?data=mock');
    await screen.findByText(/Fleet availability/i, {}, { timeout: 5000 });
    await waitFor(() => expect(screen.getByText('WXX 1234')).toBeInTheDocument(), { timeout: 5000 });
  });
});
