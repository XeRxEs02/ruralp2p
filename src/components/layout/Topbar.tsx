import { Bell, Wallet, LogOut, User, Settings } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Topbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const goToProfile = () => {
    navigate("/settings");
  };

  return (
    <header className="h-16 glass-panel border-b border-glass-border px-6 flex items-center justify-between sticky top-0 z-50">
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-semibold">
          Welcome back, {user?.fullName?.split(" ")[0]}
        </h2>
      </div>

      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          className="gap-2 border-gold/50 text-gold hover:bg-gold/20 hover:text-gold"
        >
          <Wallet className="w-4 h-4" />
          <span className="font-mono text-sm">
            {user?.walletAddress
              ? `${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(
                  -4
                )}`
              : "Connect Wallet"}
          </span>
        </Button>

        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-gold rounded-full animate-pulse" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full">
              <User className="w-5 h-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-56 glass-panel border-glass-border"
          >
            <DropdownMenuLabel>
              <div>
                <p className="font-medium">{user?.fullName}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={goToProfile} className="cursor-pointer">
              <Settings className="w-4 h-4 mr-2" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={logout}
              className="text-destructive cursor-pointer"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};
