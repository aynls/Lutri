import {
  Children,
  Fragment,
  isValidElement,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import * as Primitive from "@radix-ui/react-select";
import { CaretDownIcon, CaretUpIcon, CheckIcon } from "@phosphor-icons/react";
import "./select.css";

type Option = { value: string; label: ReactNode; disabled?: boolean; hidden?: boolean; group?: string };
type OptionProps = {
  value?: string | number;
  children?: ReactNode;
  disabled?: boolean;
  hidden?: boolean;
  label?: string;
};
type SelectProps = Omit<ComponentPropsWithoutRef<"button">, "value" | "defaultValue" | "onChange" | "children"> & {
  value: string | number | undefined;
  onValueChange: (value: string) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
};

function textContent(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) => (isValidElement<OptionProps>(child) ? textContent(child.props.children) : String(child)))
    .join("");
}

// Options are declarative data; the native option elements never enter the DOM.
function readOptions(children: ReactNode, group?: string, groupDisabled = false): Option[] {
  return Children.toArray(children).flatMap((child): Option[] => {
    if (!isValidElement<OptionProps>(child)) return [];
    if (child.type === Fragment) return readOptions(child.props.children, group, groupDisabled);
    if (child.type === "optgroup") return readOptions(child.props.children, child.props.label, child.props.disabled);
    if (child.type !== "option") return [];
    return [
      {
        value: String(child.props.value ?? textContent(child.props.children)),
        label: child.props.children,
        disabled: groupDisabled || child.props.disabled,
        hidden: child.props.hidden,
        group,
      },
    ];
  });
}

export function Select({
  value,
  onValueChange,
  open,
  onOpenChange,
  children,
  className = "",
  disabled,
  name,
  ...props
}: SelectProps) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [container, setContainer] = useState<HTMLElement | undefined>();
  useLayoutEffect(() => {
    if (open) setContainer(trigger.current?.closest("dialog") ?? undefined);
  }, [open]);
  const options = readOptions(children);
  const selected = options.find((option) => option.value === String(value)) ?? options[0];
  // Prefix every value so an empty value remains a selectable choice in Radix.
  const encode = (value: string) => `value:${value}`;
  const item = (option: Option) => (
    <Primitive.Item
      key={option.value}
      value={encode(option.value)}
      disabled={option.disabled}
      className="select-option"
      textValue={textContent(option.label)}
    >
      <Primitive.ItemText>{option.label}</Primitive.ItemText>
      <Primitive.ItemIndicator className="select-check">
        <CheckIcon size={14} weight="bold" />
      </Primitive.ItemIndicator>
    </Primitive.Item>
  );
  const visible = options.filter((option) => !option.hidden);
  const groups: { label?: string; options: Option[] }[] = [];
  for (const option of visible) {
    const last = groups[groups.length - 1];
    if (last && last.label === option.group) last.options.push(option);
    else groups.push({ label: option.group, options: [option] });
  }
  return (
    <Primitive.Root
      open={open}
      value={selected ? encode(selected.value) : ""}
      disabled={disabled}
      onValueChange={(next) => onValueChange(next.slice(6))}
      onOpenChange={(open) => {
        if (open) setContainer(trigger.current?.closest("dialog") ?? undefined);
        onOpenChange?.(open);
      }}
    >
      {name && <input type="hidden" name={name} value={value ?? ""} disabled={disabled} />}
      <Primitive.Trigger {...props} ref={trigger} className={`select-trigger ${className}`}>
        <span className="select-value">
          <Primitive.Value>{selected?.label}</Primitive.Value>
        </span>
        <Primitive.Icon className="select-chevron">
          <CaretDownIcon size={14} />
        </Primitive.Icon>
      </Primitive.Trigger>
      <Primitive.Portal container={container}>
        <Primitive.Content
          className="select-content"
          position="popper"
          sideOffset={5}
          collisionPadding={8}
          onEscapeKeyDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <Primitive.ScrollUpButton className="select-scroll">
            <CaretUpIcon size={14} />
          </Primitive.ScrollUpButton>
          <Primitive.Viewport className="select-viewport">
            {groups.map((group, index) =>
              group.label ? (
                <Primitive.Group key={index}>
                  <Primitive.Label className="select-group-label">{group.label}</Primitive.Label>
                  {group.options.map(item)}
                </Primitive.Group>
              ) : (
                <Fragment key={index}>{group.options.map(item)}</Fragment>
              ),
            )}
          </Primitive.Viewport>
          <Primitive.ScrollDownButton className="select-scroll">
            <CaretDownIcon size={14} />
          </Primitive.ScrollDownButton>
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
