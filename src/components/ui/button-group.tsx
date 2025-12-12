import * as React from "react"
import { cn } from "@/lib/utils"

const ButtonGroup = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
  const childrenArray = React.Children.toArray(children)

  return (
    <div
      ref={ref}
      className={cn("inline-flex -space-x-px", className)}
      {...props}
    >
      {childrenArray.map((child, index) => {
        if (!React.isValidElement(child)) return child

        const isFirst = index === 0
        const isLast = index === childrenArray.length - 1

        return React.cloneElement(child as React.ReactElement<any>, {
          className: cn(
            child.props.className,
            !isFirst && "rounded-l-none",
            !isLast && "rounded-r-none"
          ),
        })
      })}
    </div>
  )
})
ButtonGroup.displayName = "ButtonGroup"

export { ButtonGroup }
