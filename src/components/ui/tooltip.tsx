import * as TooltipPrimitive from '@radix-ui/react-tooltip';

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;
export const TooltipContent = ({ children }: { children: React.ReactNode }) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content sideOffset={7} className="z-[120] rounded-md bg-[#12233b] px-2.5 py-1.5 text-xs text-white shadow-lg">
      {children}
    </TooltipPrimitive.Content>
  </TooltipPrimitive.Portal>
);
