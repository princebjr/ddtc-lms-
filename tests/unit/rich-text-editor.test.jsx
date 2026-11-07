// @vitest-environment jsdom
// The lesson editor's toolbar keeps the writing place: pressing a formatting button with a mouse or
// a finger leaves the focus in the text, so the next letter typed goes into the lesson (in CI the
// first letter after Bold was lost while the focus came back from the button) and a phone keyboard
// does not close and reopen on every tap.
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RichTextEditor from '@/components/lessons/RichTextEditor.jsx';

describe('RichTextEditor toolbar', () => {
  it('leaves the focus in the text when a formatting button is pressed', async () => {
    render(<RichTextEditor label="Lesson text" value="<p>In the beginning</p>" onChange={() => {}} />);
    const text = await screen.findByRole('textbox', { name: 'Lesson text' });
    const toolbar = screen.getByRole('toolbar', { name: 'Lesson text formatting' });
    for (const name of ['Bold', 'Italic', 'Heading', 'Bulleted list', 'Link']) {
      const button = within(toolbar).getByRole('button', { name: new RegExp(`^${name}$`) });
      // fireEvent returns false when the press's default (moving the focus to the button) is prevented.
      expect(fireEvent.mouseDown(button)).toBe(false);
    }
    expect(text).toHaveAttribute('contenteditable', 'true');
  });
});
