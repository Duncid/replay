import { useState, useMemo } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FolderOpen, Search } from 'lucide-react';
import { Composition } from '@/hooks/useCompositions';
import { format } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';

interface CompositionDropdownProps {
  compositions: Composition[];
  onSelect: (composition: Composition) => void;
  isLoading?: boolean;
}

export function CompositionDropdown({
  compositions,
  onSelect,
  isLoading = false,
}: CompositionDropdownProps) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  const filteredCompositions = useMemo(() => {
    if (!search.trim()) return compositions;
    const lowerSearch = search.toLowerCase();
    return compositions.filter(c => 
      c.title.toLowerCase().includes(lowerSearch)
    );
  }, [compositions, search]);

  const handleSelect = (composition: Composition) => {
    onSelect(composition);
    setOpen(false);
    setSearch('');
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={isLoading}>
          <FolderOpen className="h-4 w-4" />
          Open
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <div className="p-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search compositions..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8"
            />
          </div>
        </div>
        <ScrollArea className="h-[200px]">
          {filteredCompositions.length === 0 ? (
            <div className="px-2 py-4 text-center text-sm text-muted-foreground">
              {compositions.length === 0 ? 'No saved compositions' : 'No matches found'}
            </div>
          ) : (
            filteredCompositions.map((composition) => (
              <DropdownMenuItem
                key={composition.id}
                onClick={() => handleSelect(composition)}
                className="flex flex-col items-start gap-1 cursor-pointer"
              >
                <span className="font-medium truncate w-full">{composition.title}</span>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(composition.updated_at), 'MMM d, yyyy h:mm a')}
                </span>
              </DropdownMenuItem>
            ))
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
