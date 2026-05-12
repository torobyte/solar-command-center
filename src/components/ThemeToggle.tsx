import { Sun, Moon, Monitor, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/lib/theme";

export function ThemeToggle() {
  const { theme, resolved, setTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Theme" className="relative rounded-full hover:bg-muted/70">
          <Sun
            className={`h-[18px] w-[18px] absolute transition-all duration-500 ${
              resolved === "dark" ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"
            }`}
            strokeWidth={2.2}
          />
          <Moon
            className={`h-[18px] w-[18px] absolute transition-all duration-500 ${
              resolved === "dark" ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0"
            }`}
            strokeWidth={2.2}
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[160px] rounded-xl">
        {[
          { v: "light", label: "Claro", Icon: Sun },
          { v: "dark", label: "Oscuro", Icon: Moon },
          { v: "system", label: "Sistema", Icon: Monitor },
        ].map(({ v, label, Icon }) => (
          <DropdownMenuItem
            key={v}
            onClick={() => setTheme(v as "light" | "dark" | "system")}
            className="rounded-lg"
          >
            <Icon className="mr-2 h-4 w-4" strokeWidth={2.2} />
            <span className="flex-1">{label}</span>
            {theme === v && <Check className="h-3.5 w-3.5 text-accent" strokeWidth={2.6} />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
