import { act, createEvent, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import IconActionButton from './IconActionButton';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('a normal tap performs the action', () => {
  const action = jest.fn();
  render(<IconActionButton label="Call customer" onClick={action}>Icon</IconActionButton>);
  const button = screen.getByRole('button', { name: 'Call customer' });
  fireEvent.pointerDown(button);
  fireEvent.pointerUp(button);
  fireEvent.click(button);
  expect(action).toHaveBeenCalledTimes(1);
});

test('long press shows the label and suppresses the action', () => {
  const action = jest.fn();
  render(<IconActionButton label="Call customer" onClick={action}>Icon</IconActionButton>);
  const button = screen.getByRole('button', { name: 'Call customer' });
  fireEvent.pointerDown(button);
  act(() => jest.advanceTimersByTime(500));
  expect(screen.getByRole('tooltip')).toHaveTextContent('Call customer');
  fireEvent.pointerUp(button);
  fireEvent.click(button);
  expect(action).not.toHaveBeenCalled();
  act(() => jest.advanceTimersByTime(1800));
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});

test('mouse hover shows the action name', () => {
  render(<IconActionButton label="Navigate">Icon</IconActionButton>);
  const button = screen.getByRole('button', { name: 'Navigate' });
  const event = createEvent.pointerOver(button, { bubbles: true });
  Object.defineProperty(event, 'pointerType', { value: 'mouse' });
  fireEvent(button, event);
  expect(screen.getByRole('tooltip')).toHaveTextContent('Navigate');
});
