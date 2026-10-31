// @vitest-environment jsdom
import {createElement} from 'react';
import {cleanup, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, expect, it} from 'vitest';
import {StoryboardLayout} from '../components/layout/StoryboardLayout';
afterEach(cleanup);
it('prioritizes the preview and shot strip while keeping shot controls available on demand', async()=>{
 render(createElement(StoryboardLayout,{previewSlot:createElement('p',null,'Selected frame'),shotListSlot:createElement('p',null,'Board sequence'),inspectorSlot:createElement('button',null,'Generate video')}));
 expect(screen.getByRole('region',{name:'Shot preview'}).textContent).toContain('Selected frame');
 expect(screen.getByRole('region',{name:'Shot sequence'}).textContent).toContain('Board sequence');
 expect(screen.queryByRole('button',{name:'Generate video'})).toBeNull();
 const user=userEvent.setup();
 await user.click(screen.getByRole('button',{name:'Shot controls',exact:true}));
 expect(screen.getByRole('button',{name:'Generate video'})).toBeTruthy();
 await user.click(screen.getByRole('button',{name:'Shot controls',exact:true}));
 expect(screen.queryByRole('button',{name:'Generate video'})).toBeNull();
});
