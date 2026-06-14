import { ReactRenderer } from '@tiptap/react';
import tippy, { Instance as TippyInstance } from 'tippy.js';
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';

// Mock list of bots (In real app, fetch from backend)
const DOMAIN_AGENTS = [
  { id: 'bot-warpbot', display: 'WarpBot', type: 'agent' },
  { id: 'bot-codex', display: 'Codex', type: 'agent' },
  { id: 'bot-antigravity', display: 'Antigravity', type: 'agent' }
];

export const MentionList = forwardRef((props: any, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const selectItem = (index: number) => {
    const item = props.items[index];
    if (item) {
      props.command({ id: item.id, label: item.display });
    }
  };

  const upHandler = () => {
    setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length);
  };

  const downHandler = () => {
    setSelectedIndex((selectedIndex + 1) % props.items.length);
  };

  const enterHandler = () => {
    selectItem(selectedIndex);
  };

  useEffect(() => setSelectedIndex(0), [props.items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: any) => {
      if (event.key === 'ArrowUp') {
        upHandler();
        return true;
      }
      if (event.key === 'ArrowDown') {
        downHandler();
        return true;
      }
      if (event.key === 'Enter') {
        enterHandler();
        return true;
      }
      return false;
    },
  }));

  return (
    <div className="bg-surface-1 border border-border rounded-lg shadow-lg overflow-hidden py-1 min-w-[200px]">
      {props.items.length ? (
        props.items.map((item: any, index: number) => (
          <button
            className={`w-full text-left px-3 py-1.5 text-[13px] ${
              index === selectedIndex ? 'bg-canvas text-brand-primary' : 'text-ink bg-transparent'
            }`}
            key={index}
            onClick={() => selectItem(index)}
          >
            <span className="font-semibold mr-1">@{item.display}</span>
            <span className="text-[11px] text-ink-subtle uppercase">{item.type}</span>
          </button>
        ))
      ) : (
        <div className="px-3 py-1.5 text-[13px] text-ink-subtle">No agents found</div>
      )}
    </div>
  );
});

MentionList.displayName = 'MentionList';

export const suggestion = {
  items: ({ query }: { query: string }) => {
    return DOMAIN_AGENTS.filter(item => item.display.toLowerCase().startsWith(query.toLowerCase())).slice(0, 5);
  },
  render: () => {
    let component: ReactRenderer;
    let popup: TippyInstance[];

    return {
      onStart: (props: any) => {
        component = new ReactRenderer(MentionList, {
          props,
          editor: props.editor,
        });

        if (!props.clientRect) {
          return;
        }

        popup = tippy('body', {
          getReferenceClientRect: props.clientRect,
          appendTo: () => document.body,
          content: component.element,
          showOnCreate: true,
          interactive: true,
          trigger: 'manual',
          placement: 'top-start',
        });
      },
      onUpdate(props: any) {
        component.updateProps(props);

        if (!props.clientRect) {
          return;
        }

        popup[0].setProps({
          getReferenceClientRect: props.clientRect,
        });
      },
      onKeyDown(props: any) {
        if (props.event.key === 'Escape') {
          popup[0].hide();
          return true;
        }
        return (component.ref as any)?.onKeyDown(props);
      },
      onExit() {
        popup[0].destroy();
        component.destroy();
      },
    };
  },
};
