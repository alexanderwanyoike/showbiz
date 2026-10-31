// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from '../../components/ui/button';

afterEach(cleanup);

describe('native action controls', () => {
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
