import * as React from 'react';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { cn } from '@/lib/utils';

export const DropdownMenu = Dropdown.Root;
export const DropdownMenuTrigger = Dropdown.Trigger;
export const DropdownMenuSeparator = Dropdown.Separator;
export const DropdownMenuContent = React.forwardRef<React.ElementRef<typeof Dropdown.Content>, React.ComponentPropsWithoutRef<typeof Dropdown.Content>>(
  ({ className, sideOffset = 6, ...props }, ref) => (
    <Dropdown.Portal>
      <Dropdown.Content ref={ref} sideOffset={sideOffset} className={cn('z-[110] min-w-[174px] rounded-lg border border-border bg-surface p-1.5 text-foreground shadow-xl outline-none', className)} {...props} />
    </Dropdown.Portal>
  ),
);
DropdownMenuContent.displayName = 'DropdownMenuContent';
export const DropdownMenuItem = React.forwardRef<React.ElementRef<typeof Dropdown.Item>, React.ComponentPropsWithoutRef<typeof Dropdown.Item>>(
  ({ className, ...props }, ref) => (
    <Dropdown.Item ref={ref} className={cn('flex cursor-pointer select-none items-center gap-2 rounded-md px-3 py-2 text-sm outline-none focus:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-40', className)} {...props} />
  ),
);
DropdownMenuItem.displayName = 'DropdownMenuItem';
