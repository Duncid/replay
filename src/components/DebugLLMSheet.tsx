import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { DebugLLMCall } from "@/hooks/useLessonEngine";
import { Copy } from "lucide-react";

interface DebugLLMSheetProps {
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  debugCall?: DebugLLMCall;
}

export function DebugLLMSheet({
  title,
  open,
  onOpenChange,
  debugCall,
}: DebugLLMSheetProps) {
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      console.error("Failed to copy", e);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[600px] sm:max-w-[600px]">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-80px)] mt-4">
          {/* Request Section */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">Request</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  copyToClipboard(debugCall?.request || "")
                }
              >
                <Copy className="h-3 w-3 mr-1" />
                Copy
              </Button>
            </div>
            <pre className="text-xs font-mono whitespace-pre-wrap bg-muted p-4 rounded-md">
              {debugCall?.request || "Not captured yet."}
            </pre>
          </div>
          {/* Response Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">Response</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  copyToClipboard(debugCall?.response || "")
                }
              >
                <Copy className="h-3 w-3 mr-1" />
                Copy
              </Button>
            </div>
            <pre className="text-xs font-mono whitespace-pre-wrap bg-muted p-4 rounded-md">
              {debugCall?.response || "Not captured yet."}
            </pre>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
