import { VercelNotificationPopover } from "@/components/ui/vercel-notification-popover"

export default function Demo() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-8">
      <div className="flex items-center gap-4">
        <span className="text-sm text-muted-foreground">Click the bell →</span>
        <VercelNotificationPopover />
      </div>
    </div>
  )
}
