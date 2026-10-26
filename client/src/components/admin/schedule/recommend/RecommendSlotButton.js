import React from 'react';
import { CalendarSearch } from 'lucide-react';
import Button from '../../../common/Button';

// Header entry point for the salesperson's "when can we deliver this?" check.
// Advisory only, so it is shown to everyone who can view the schedule.
export default function RecommendSlotButton({ onClick, pressed = false }) {
  return (
    <Button variant="tint" size="sm" icon={CalendarSearch} aria-pressed={pressed} onClick={onClick}>
      Find a slot
    </Button>
  );
}
