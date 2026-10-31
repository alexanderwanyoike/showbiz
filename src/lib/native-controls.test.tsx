// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from '../../components/ui/button';

afterEach(cleanup);

describe('native action controls', () => {
  it('exposes the control role and size while preserving a slotted link', () => {
    const onClick = vi.fn();
    render(
      <>
        <Button>Generate</Button>
        <Button asChild variant="ghost" size="sm">
          <a href="#bible" onClick={onClick}>Bible</a>
        </Button>
        <Button variant="secondary" disabled>Unavailable</Button>
      </>,
    );

    const action = screen.getByRole('button', { name: 'Generate' });
    expect(action.dataset.variant).toBe('default');
    expect(action.dataset.size).toBe('default');
    const link = screen.getByRole('link', { name: 'Bible' });
    expect(link.dataset.variant).toBe('ghost');
    expect(link.dataset.size).toBe('sm');
    expect(link.getAttribute('type')).toBeNull();
    fireEvent.click(link);
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Unavailable' }).hasAttribute('disabled')).toBe(true);
  });

  it('does not submit a surrounding form unless submission is requested', () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button>Choose model</Button>
        <Button type="submit">Save</Button>
      </form>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Choose model' }));
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });
});
