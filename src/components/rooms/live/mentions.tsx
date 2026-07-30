import { ReactRenderer } from "@tiptap/react";
import type {
  SuggestionKeyDownProps,
  SuggestionOptions,
  SuggestionProps,
} from "@tiptap/suggestion";
import tippy, { Instance as TippyInstance } from "tippy.js";
import { forwardRef, useImperativeHandle, useState } from "react";

interface DomainAgent {
  id: string;
  display: string;
  type: string;
}

interface MentionCommandAttributes {
  id: string | null;
  label?: string | null;
  mentionSuggestionChar?: string;
}

type MentionListProps = Pick<
  SuggestionProps<DomainAgent, MentionCommandAttributes>,
  "items" | "command"
>;

interface MentionListHandle {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

// WarpBot is the built-in meeting agent understood by the chat backend.
const DOMAIN_AGENTS: DomainAgent[] = [
  { id: "bot-warpbot", display: "WarpBot", type: "agent" },
];

export const MentionList = forwardRef<MentionListHandle, MentionListProps>(
  (props, ref) => {
    const [requestedIndex, setSelectedIndex] = useState(0);
    const selectedIndex = props.items.length
      ? Math.min(requestedIndex, props.items.length - 1)
      : 0;

    const selectItem = (index: number) => {
      const item = props.items[index];
      if (item) {
        props.command({ id: item.id, label: item.display });
      }
    };

    const upHandler = () => {
      if (props.items.length === 0) return;
      setSelectedIndex(
        (selectedIndex + props.items.length - 1) % props.items.length,
      );
    };

    const downHandler = () => {
      if (props.items.length === 0) return;
      setSelectedIndex((selectedIndex + 1) % props.items.length);
    };

    const enterHandler = () => {
      if (props.items.length === 0) return;
      selectItem(selectedIndex);
    };

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: SuggestionKeyDownProps) => {
        if (event.key === "ArrowUp") {
          upHandler();
          return true;
        }
        if (event.key === "ArrowDown") {
          downHandler();
          return true;
        }
        if (event.key === "Enter") {
          enterHandler();
          return true;
        }
        return false;
      },
    }));

    return (
      <div className="bg-surface-1 border border-border rounded-lg shadow-lg overflow-hidden py-1 min-w-[200px]">
        {props.items.length ? (
          props.items.map((item, index) => (
            <button
              className={`w-full text-left px-3 py-1.5 text-[13px] ${
                index === selectedIndex
                  ? "bg-canvas text-brand-primary"
                  : "text-ink bg-transparent"
              }`}
              key={index}
              onClick={() => selectItem(index)}
            >
              <span className="font-semibold mr-1">@{item.display}</span>
              <span className="text-[11px] text-ink-subtle uppercase">
                {item.type}
              </span>
            </button>
          ))
        ) : (
          <div className="px-3 py-1.5 text-[13px] text-ink-subtle">
            No agents found
          </div>
        )}
      </div>
    );
  },
);

MentionList.displayName = "MentionList";

export const suggestion: Omit<
  SuggestionOptions<DomainAgent, MentionCommandAttributes>,
  "editor"
> = {
  items: ({ query }: { query: string }) => {
    return DOMAIN_AGENTS.filter((item) =>
      item.display.toLowerCase().startsWith(query.toLowerCase()),
    ).slice(0, 5);
  },
  render: () => {
    let component: ReactRenderer<MentionListHandle, MentionListProps>;
    let popup: TippyInstance[] | undefined;

    return {
      onStart: (
        props: SuggestionProps<DomainAgent, MentionCommandAttributes>,
      ) => {
        component = new ReactRenderer(MentionList, {
          props,
          editor: props.editor,
        });

        if (!props.clientRect) {
          return;
        }

        popup = tippy("body", {
          getReferenceClientRect: () => props.clientRect?.() ?? new DOMRect(),
          appendTo: () => document.body,
          content: component.element,
          showOnCreate: true,
          interactive: true,
          trigger: "manual",
          placement: "top-start",
        });
      },
      onUpdate(props: SuggestionProps<DomainAgent, MentionCommandAttributes>) {
        component.updateProps(props);

        if (!props.clientRect) {
          return;
        }

        popup?.[0]?.setProps({
          getReferenceClientRect: () => props.clientRect?.() ?? new DOMRect(),
        });
      },
      onKeyDown(props: SuggestionKeyDownProps) {
        if (props.event.key === "Escape") {
          popup?.[0]?.hide();
          return true;
        }
        return component.ref?.onKeyDown(props) ?? false;
      },
      onExit() {
        popup?.[0]?.destroy();
        component.destroy();
      },
    };
  },
};
