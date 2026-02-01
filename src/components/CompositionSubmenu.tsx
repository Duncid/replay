import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Composition } from "@/hooks/useCompositions";
import { format } from "date-fns";
import { FolderOpen, Search } from "lucide-react";
import { useMemo, useState } from "react";

interface CompositionSubmenuProps {
  compositions: Composition[];
  onSelect: (composition: Composition) => void;
  isLoading?: boolean;
}

export function CompositionSubmenu({
  compositions,
  onSelect,
  isLoading = false,
}: CompositionSubmenuProps) {
  const [search, setSearch] = useState("");

  const filteredCompositions = useMemo(() => {
    if (!search.trim()) return compositions;
    const lowerSearch = search.toLowerCase();
    return compositions.filter((c) =>
      c.title.toLowerCase().includes(lowerSearch),
    );
  }, [compositions, search]);

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger disabled={isLoading}>
        <FolderOpen />
        Open
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-72">
        <div className="p-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search compositions..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            />
          </div>
        </div>
        <ScrollArea className="h-[200px]">
          {filteredCompositions.length === 0 ? (
            <div className="px-2 py-4 text-center text-sm text-muted-foreground">
              {compositions.length === 0
                ? "No saved compositions"
                : "No matches found"}
            </div>
          ) : (
            filteredCompositions.map((composition) => (
              <DropdownMenuItem
                key={composition.id}
                onClick={() => onSelect(composition)}
                className="flex flex-col items-start gap-1 cursor-pointer"
              >
                <span className="font-medium truncate w-full">
                  {composition.title}
                </span>
                <span className="text-xs text-muted-foreground">
                  {format(
                    new Date(composition.updated_at),
                    "MMM d, yyyy h:mm a",
                  )}
                </span>
              </DropdownMenuItem>
            ))
          )}
        </ScrollArea>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
