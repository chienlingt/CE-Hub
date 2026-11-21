import '@testing-library/jest-dom';
import { act, render, screen } from '@testing-library/react';
import { setNoteDismissed, useSharedNote } from './DriverRoute';

function Run({ name, wanted = true }) {
  const show = useSharedNote('unchanged', wanted);
  return show ? <p>{`Route unchanged: past or invalid session (${name})`}</p> : null;
}

afterEach(() => act(() => setNoteDismissed('unchanged', false)));

test('three past runs show the note once, from the first run', () => {
  render(<><Run name="A" /><Run name="B" /><Run name="C" /></>);
  expect(screen.getAllByText(/past or invalid session/)).toHaveLength(1);
  expect(screen.getByText(/\(A\)/)).toBeInTheDocument();
});

test('a run that does not have the note does not take it over', () => {
  render(<><Run name="A" wanted={false} /><Run name="B" /></>);
  expect(screen.getByText(/\(B\)/)).toBeInTheDocument();
  expect(screen.getAllByText(/past or invalid session/)).toHaveLength(1);
});

test('when the first run goes away, the next run shows it', () => {
  const { rerender } = render(<><Run name="A" /><Run name="B" /></>);
  rerender(<><Run name="A" wanted={false} /><Run name="B" /></>);
  expect(screen.getByText(/\(B\)/)).toBeInTheDocument();
  expect(screen.getAllByText(/past or invalid session/)).toHaveLength(1);
});

test('closing the note hides it for every run, until Optimal arms it again', () => {
  render(<><Run name="A" /><Run name="B" /></>);
  act(() => setNoteDismissed('unchanged', true));
  expect(screen.queryByText(/past or invalid session/)).not.toBeInTheDocument();
  act(() => setNoteDismissed('unchanged', false));
  expect(screen.getAllByText(/past or invalid session/)).toHaveLength(1);
});
